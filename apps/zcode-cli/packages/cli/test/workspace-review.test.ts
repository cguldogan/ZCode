// specs/tui/diff-review-undo.md §1 — /review git parsing and the git-backed provider.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import type { TuiReviewFile } from "@zcode/tui";
import {
  buildUntrackedFileDiff,
  parseNameStatusZ,
  parseNumstatZ,
  parseUnifiedDiff,
} from "../src/workspace-review/git-review-parse.js";
import { formatWorkspaceReviewSummary } from "../src/workspace-review/review-summary.js";
import { runReviewSummaryCommand } from "../src/workspace-review/review-prompt-command.js";
import {
  createWorkspaceReviewProvider,
  REVIEW_DIFF_MAX_LINES,
} from "../src/workspace-review/workspace-review.js";

// Keep git from discovering any repository above the temp directories used here.
process.env.GIT_CEILING_DIRECTORIES = tmpdir();

test("parseNameStatusZ handles plain, rename and copy records", () => {
  const output = [
    "M",
    "src/a.ts",
    "A",
    "new file.txt",
    "D",
    "gone.md",
    "R100",
    "old.ts",
    "new.ts",
    "C75",
    "x.ts",
    "y.ts",
    "",
  ].join("\0");
  assert.deepEqual(parseNameStatusZ(output), [
    { path: "src/a.ts", status: "modified" },
    { path: "new file.txt", status: "added" },
    { path: "gone.md", status: "deleted" },
    { path: "new.ts", previousPath: "old.ts", status: "renamed" },
    { path: "y.ts", previousPath: "x.ts", status: "copied" },
  ]);
});

test("parseNumstatZ handles counts, binary markers and renames", () => {
  const output = [
    "3\t1\tsrc/a.ts",
    "-\t-\timage.png",
    "0\t0\t",
    "old.ts",
    "new.ts",
    "5\t0\twith\ttab.txt",
    "",
  ].join("\0");
  const entries = parseNumstatZ(output);
  assert.deepEqual(entries.get("src/a.ts"), { additions: 3, binary: false, deletions: 1 });
  assert.deepEqual(entries.get("image.png"), { additions: 0, binary: true, deletions: 0 });
  assert.deepEqual(entries.get("new.ts"), { additions: 0, binary: false, deletions: 0 });
  assert.deepEqual(entries.get("with\ttab.txt"), { additions: 5, binary: false, deletions: 0 });
});

test("parseUnifiedDiff builds hunks and skips headers and no-newline markers", () => {
  const output = [
    "diff --git a/a.ts b/a.ts",
    "index 1..2 100644",
    "--- a/a.ts",
    "+++ b/a.ts",
    "@@ -1,2 +1,3 @@",
    " keep\r",
    "-old",
    "+new",
    "+added",
    "\\ No newline at end of file",
    "@@ -10 +11 @@ function x()",
    "-a",
    "+b",
    "",
  ].join("\n");
  const parsed = parseUnifiedDiff(output, { maxLines: 100, outputTruncated: false });
  assert.equal(parsed.binary, false);
  assert.equal(parsed.truncated, false);
  assert.deepEqual(parsed.hunks, [
    {
      lines: [" keep", "-old", "+new", "+added"],
      newLines: 3,
      newStart: 1,
      oldLines: 2,
      oldStart: 1,
    },
    { lines: ["-a", "+b"], newLines: 1, newStart: 11, oldLines: 1, oldStart: 10 },
  ]);
});

test("parseUnifiedDiff detects binary files and truncates long diffs", () => {
  const binary = parseUnifiedDiff("diff --git a/x b/x\nBinary files a/x and b/x differ\n", {
    maxLines: 10,
    outputTruncated: false,
  });
  assert.deepEqual(binary, { binary: true, hunks: [], truncated: false });

  const long = ["@@ -1,0 +1,50 @@", ...Array.from({ length: 50 }, (_, i) => `+line ${i}`)].join(
    "\n",
  );
  const truncated = parseUnifiedDiff(long, { maxLines: 10, outputTruncated: false });
  assert.equal(truncated.truncated, true);
  assert.equal(truncated.hunks[0]?.lines.length, 10);

  // A byte-capped output ends mid-line; the partial last line is dropped.
  const capped = parseUnifiedDiff("@@ -1 +1 @@\n-a\n+partial-li", {
    maxLines: 10,
    outputTruncated: true,
  });
  assert.deepEqual(capped.hunks[0]?.lines, ["-a"]);
  assert.equal(capped.truncated, true);
});

test("buildUntrackedFileDiff renders additions and detects binary content", () => {
  const text = buildUntrackedFileDiff(Buffer.from("a\r\nb\n"), {
    contentTruncated: false,
    maxLines: 10,
  });
  assert.deepEqual(text.hunks, [
    { lines: ["+a", "+b"], newLines: 2, newStart: 1, oldLines: 0, oldStart: 0 },
  ]);
  const binary = buildUntrackedFileDiff(Buffer.from([0x50, 0x00, 0x01]), {
    contentTruncated: false,
    maxLines: 10,
  });
  assert.equal(binary.binary, true);
  const capped = buildUntrackedFileDiff(Buffer.from("1\n2\n3\n4\n"), {
    contentTruncated: false,
    maxLines: 2,
  });
  assert.equal(capped.truncated, true);
  assert.equal(capped.hunks[0]?.lines.length, 2);
});

function git(cwd: string, ...args: string[]): void {
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Review Test",
      "-c",
      "user.email=review@example.invalid",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    {
      cwd,
      stdio: "ignore",
    },
  );
}

async function write(root: string, path: string, content: string | Buffer): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "zcode-review-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

function byPath(files: readonly TuiReviewFile[], path: string): TuiReviewFile | undefined {
  return files.find((file) => file.path === path);
}

test("provider lists modified, added, deleted, renamed, untracked and binary changes", async () => {
  await withTempDir(async (root) => {
    git(root, "init", "-q");
    await write(root, "src/modified.ts", "export const a = 1;\nexport const b = 2;\n");
    await write(root, "deleted.txt", "bye\n");
    await write(root, "rename-me.ts", "line 1\nline 2\nline 3\nline 4\n");
    await write(root, "image.bin", Buffer.from([1, 0, 2, 3]));
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "init");

    await write(
      root,
      "src/modified.ts",
      "export const a = 1;\nexport const b = 3;\nexport const c = 4;\n",
    );
    await rm(join(root, "deleted.txt"));
    git(root, "mv", "rename-me.ts", "renamed.ts");
    await write(root, "staged-new.ts", "new\n");
    git(root, "add", "staged-new.ts");
    await write(root, "notes/untracked.md", "one\ntwo\nthree\n");
    await write(root, "image.bin", Buffer.from([1, 0, 9, 9, 9]));

    const provider = createWorkspaceReviewProvider({ workspaceDirectory: join(root, "src") });
    const result = await provider.listChanges();
    assert.equal(result.kind, "ok");
    if (result.kind !== "ok") return;
    const files = result.snapshot.files;
    assert.deepEqual(byPath(files, "src/modified.ts"), {
      additions: 2,
      binary: false,
      deletions: 1,
      path: "src/modified.ts",
      status: "modified",
    });
    assert.equal(byPath(files, "deleted.txt")?.status, "deleted");
    assert.equal(byPath(files, "staged-new.ts")?.status, "added");
    assert.deepEqual(byPath(files, "renamed.ts"), {
      additions: 0,
      binary: false,
      deletions: 0,
      path: "renamed.ts",
      previousPath: "rename-me.ts",
      status: "renamed",
    });
    assert.deepEqual(byPath(files, "notes/untracked.md"), {
      additions: 3,
      binary: false,
      deletions: 0,
      path: "notes/untracked.md",
      status: "untracked",
    });
    assert.equal(byPath(files, "image.bin")?.binary, true);
    assert.equal(result.snapshot.truncated, false);

    const modifiedDiff = await provider.loadFileDiff(byPath(files, "src/modified.ts")!);
    assert.equal(modifiedDiff.kind, "ok");
    if (modifiedDiff.kind === "ok") {
      assert.deepEqual(modifiedDiff.hunks[0]?.lines, [
        " export const a = 1;",
        "-export const b = 2;",
        "+export const b = 3;",
        "+export const c = 4;",
      ]);
    }
    const binaryDiff = await provider.loadFileDiff(byPath(files, "image.bin")!);
    assert.equal(binaryDiff.kind === "ok" && binaryDiff.binary, true);
    const untrackedDiff = await provider.loadFileDiff(byPath(files, "notes/untracked.md")!);
    assert.equal(untrackedDiff.kind === "ok" && untrackedDiff.hunks[0]?.lines.length, 3);
    const renameDiff = await provider.loadFileDiff(byPath(files, "renamed.ts")!);
    assert.equal(
      renameDiff.kind === "ok" && renameDiff.hunks.length,
      0,
      "pure rename has no hunks",
    );
  });
});

test("provider reports not-a-repo, no changes, unborn branch and missing git", async () => {
  await withTempDir(async (dir) => {
    const notRepo = await createWorkspaceReviewProvider({ workspaceDirectory: dir }).listChanges();
    assert.deepEqual(notRepo, { directory: dir, kind: "not_git_repo" });

    git(dir, "init", "-q");
    await write(dir, "first.txt", "a\nb\n");
    git(dir, "add", "-A");
    const unborn = await createWorkspaceReviewProvider({ workspaceDirectory: dir }).listChanges();
    assert.equal(
      unborn.kind === "ok" && byPath(unborn.snapshot.files, "first.txt")?.status,
      "added",
    );
    assert.equal(unborn.kind === "ok" && byPath(unborn.snapshot.files, "first.txt")?.additions, 2);

    git(dir, "commit", "-q", "-m", "init");
    const clean = await createWorkspaceReviewProvider({ workspaceDirectory: dir }).listChanges();
    assert.equal(clean.kind === "ok" && clean.snapshot.files.length, 0);
    assert.match(formatWorkspaceReviewSummary(clean).text, /No uncommitted changes/);
  });

  const missingGit = createWorkspaceReviewProvider({
    runGit: async () => ({ code: "ENOENT", kind: "spawn_failed" }),
    workspaceDirectory: tmpdir(),
  });
  assert.deepEqual(await missingGit.listChanges(), { kind: "git_unavailable" });
  const slowGit = createWorkspaceReviewProvider({
    runGit: async () => ({ kind: "timed_out" }),
    workspaceDirectory: tmpdir(),
  });
  assert.deepEqual(await slowGit.listChanges(), { kind: "git_failed", timedOut: true });
});

test("very large diffs are truncated", async () => {
  await withTempDir(async (root) => {
    git(root, "init", "-q");
    await write(root, "big.txt", "seed\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "init");
    await write(root, "big.txt", Array.from({ length: 20_000 }, (_, i) => `line ${i}`).join("\n"));
    const provider = createWorkspaceReviewProvider({ workspaceDirectory: root });
    const listing = await provider.listChanges();
    assert.equal(listing.kind, "ok");
    if (listing.kind !== "ok") return;
    const diff = await provider.loadFileDiff(listing.snapshot.files[0]!);
    assert.equal(diff.kind, "ok");
    if (diff.kind !== "ok") return;
    assert.equal(diff.truncated, true);
    const rows = diff.hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0);
    assert.ok(rows <= REVIEW_DIFF_MAX_LINES, `rows ${rows}`);
  });
});

test("prompt-mode /review prints a summary and exits with the right code", async () => {
  await withTempDir(async (root) => {
    const output = { stderr: "", stdout: "" };
    const ctx = {
      stderr: { write: (chunk: string) => ((output.stderr += chunk), true) },
      stdout: { write: (chunk: string) => ((output.stdout += chunk), true) },
    };
    assert.equal(
      await runReviewSummaryCommand(ctx as never, { args: "", workspaceDirectory: root }),
      1,
    );
    assert.match(output.stderr, /Not a git repository/);

    git(root, "init", "-q");
    await write(root, "a.txt", "1\n");
    assert.equal(
      await runReviewSummaryCommand(ctx as never, { args: "", workspaceDirectory: root }),
      0,
    );
    assert.match(output.stdout, /1 file, \+1 -0/);
    assert.match(output.stdout, /\?\s+a\.txt\s+\+1 -0/);
    assert.equal(
      await runReviewSummaryCommand(ctx as never, { args: "x", workspaceDirectory: root }),
      1,
    );
  });
});

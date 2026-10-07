import assert from "node:assert/strict";
import test from "node:test";
import type { GitHubBuildUpdateResult } from "@zcode/shared";
import { runUpdateCommand, UPDATE_AVAILABLE_EXIT_CODE } from "../src/update-command.js";

// specs/self-hosted-build/github-update-check.md §5: `zcode update` only reports.
function captureContext() {
  let stderr = "";
  let stdout = "";
  return {
    ctx: {
      stderr: { write: (chunk: string) => ((stderr += chunk), true) },
      stdout: { write: (chunk: string) => ((stdout += chunk), true) },
    },
    output: () => ({ stderr, stdout }),
  };
}

const latest = "0123456789abcdef0123456789abcdef01234567";
const available: GitHubBuildUpdateResult = {
  kind: "update-available",
  currentCommit: "fedcba98",
  latestCommit: latest,
  commitsBehind: 3,
  changes: [{ sha: latest, subject: "feat: newest" }],
  downloadUrl: "https://github.com/cguldogan/ZCode/releases/tag/latest",
  compareUrl: "https://github.com/cguldogan/ZCode/compare/fedcba98...0123456",
};

test("reports an available update with exit code 10 and passes the build commit", async () => {
  const { ctx, output } = captureContext();
  const seen: Array<{ repository: string; currentCommit: string }> = [];
  const code = await runUpdateCommand(ctx as never, {} as never, [], {
    currentCommit: "fedcba98",
    checkUpdate: async (options) => {
      seen.push({ repository: options.repository, currentCommit: options.currentCommit });
      return available;
    },
  });
  assert.equal(code, UPDATE_AVAILABLE_EXIT_CODE);
  assert.deepEqual(seen, [{ repository: "cguldogan/ZCode", currentCommit: "fedcba98" }]);
  assert.equal(
    output().stdout,
    [
      "A newer build is available: fedcba98 -> 01234567 (3 new commits).",
      "  01234567 feat: newest",
      `Changes:  ${available.compareUrl}`,
      `Download: ${available.downloadUrl}`,
      "",
    ].join("\n"),
  );
});

test("--json prints the result object", async () => {
  const { ctx, output } = captureContext();
  const code = await runUpdateCommand(ctx as never, { json: true } as never, [], {
    checkUpdate: async () => available,
  });
  assert.equal(code, UPDATE_AVAILABLE_EXIT_CODE);
  assert.deepEqual(JSON.parse(output().stdout), available);
});

test("up to date exits 0; errors go to stderr with exit 1; extra arguments are rejected", async () => {
  const upToDate = captureContext();
  assert.equal(
    await runUpdateCommand(upToDate.ctx as never, {} as never, [], {
      checkUpdate: async () => ({
        kind: "up-to-date",
        currentCommit: "01234567",
        latestCommit: latest,
        downloadUrl: available.downloadUrl,
      }),
    }),
    0,
  );
  assert.equal(upToDate.output().stdout, "You're on the latest build (01234567).\n");

  const failed = captureContext();
  assert.equal(
    await runUpdateCommand(failed.ctx as never, {} as never, [], {
      checkUpdate: async () => ({ kind: "error", currentCommit: "x", message: "offline" }),
    }),
    1,
  );
  assert.equal(failed.output().stderr, "Update check failed: offline\n");

  const usage = captureContext();
  assert.equal(
    await runUpdateCommand(usage.ctx as never, {} as never, ["now"], {
      checkUpdate: async () => {
        throw new Error("must not check");
      },
    }),
    1,
  );
  assert.equal(usage.output().stderr, "Usage: zcode update [--json]\n");
});

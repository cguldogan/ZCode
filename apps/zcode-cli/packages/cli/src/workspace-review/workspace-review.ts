// Git-backed `/review` provider (specs/tui/diff-review-undo.md §1). Single owner of the git and
// file I/O behind the TUI review view and the `zcode -p /review` summary.
import { lstat, open, readlink } from "node:fs/promises";
import { join } from "node:path";
import type {
  TuiReviewFailure,
  TuiReviewFile,
  TuiReviewFileDiffResult,
  TuiWorkspaceReview,
} from "@zcode/tui";
import { runGit, type GitRunner, type GitRunOutcome } from "./git-process.js";
import {
  buildUntrackedFileDiff,
  countTextLines,
  isBinaryContent,
  parseNameStatusZ,
  parseNumstatZ,
  parseUnifiedDiff,
} from "./git-review-parse.js";

export const REVIEW_MAX_FILES = 1000;
export const REVIEW_DIFF_MAX_LINES = 2000;
export const REVIEW_DIFF_MAX_BYTES = 1024 * 1024;
const REVIEW_LIST_MAX_BYTES = 8 * 1024 * 1024;
const REVIEW_SMALL_OUTPUT_MAX_BYTES = 64 * 1024;
const UNTRACKED_COUNT_MAX_BYTES = 2 * 1024 * 1024;
const GIT_TIMEOUT_MS = 10_000;
const HEAD_REF = "HEAD";
const NOT_FOUND_ERROR_CODE = "ENOENT";
const DIFF_COMMON_ARGS = ["diff", "--no-color", "--no-ext-diff", "--no-textconv", "-M"] as const;

export type FileReader = (
  path: string,
  maxBytes: number,
) => Promise<{ content: Buffer; truncated: boolean }>;

type Repo = { base: string; root: string };

export function createWorkspaceReviewProvider(options: {
  readFile?: FileReader;
  runGit?: GitRunner;
  workspaceDirectory: string;
}): TuiWorkspaceReview {
  const git = options.runGit ?? runGit;
  const readFile = options.readFile ?? readFileCapped;

  const run = (
    args: readonly string[],
    cwd: string,
    maxOutputBytes: number,
    signal?: AbortSignal,
  ) => git(args, { abortSignal: signal, cwd, maxOutputBytes, timeoutMs: GIT_TIMEOUT_MS });

  const resolveRepo = async (signal?: AbortSignal): Promise<Repo | TuiReviewFailure> => {
    const top = await run(
      ["rev-parse", "--show-toplevel"],
      options.workspaceDirectory,
      REVIEW_SMALL_OUTPUT_MAX_BYTES,
      signal,
    );
    if (top.kind === "completed" && top.exitCode !== 0) {
      return { directory: options.workspaceDirectory, kind: "not_git_repo" };
    }
    if (top.kind !== "completed") return failureFromOutcome(top);
    const root = top.stdout.toString("utf8").trim();
    const head = await run(
      ["rev-parse", "--verify", "--quiet", `${HEAD_REF}^{commit}`],
      root,
      REVIEW_SMALL_OUTPUT_MAX_BYTES,
      signal,
    );
    if (head.kind !== "completed") return failureFromOutcome(head);
    if (head.exitCode === 0) return { base: HEAD_REF, root };
    // Unborn branch: compare against the empty tree of this repository's hash format.
    const emptyTree = await run(
      ["hash-object", "-t", "tree", "--stdin"],
      root,
      REVIEW_SMALL_OUTPUT_MAX_BYTES,
      signal,
    );
    if (emptyTree.kind !== "completed" || emptyTree.exitCode !== 0) {
      return failureFromOutcome(emptyTree);
    }
    return { base: emptyTree.stdout.toString("utf8").trim(), root };
  };

  return {
    async listChanges(listOptions) {
      const signal = listOptions?.abortSignal;
      const repo = await resolveRepo(signal);
      if ("kind" in repo) return repo;
      const [nameStatus, numstat, untracked] = await Promise.all([
        run(
          [...DIFF_COMMON_ARGS, "--name-status", "-z", repo.base, "--"],
          repo.root,
          REVIEW_LIST_MAX_BYTES,
          signal,
        ),
        run(
          [...DIFF_COMMON_ARGS, "--numstat", "-z", repo.base, "--"],
          repo.root,
          REVIEW_LIST_MAX_BYTES,
          signal,
        ),
        run(
          ["ls-files", "--others", "--exclude-standard", "-z"],
          repo.root,
          REVIEW_LIST_MAX_BYTES,
          signal,
        ),
      ]);
      if (!isSuccess(nameStatus)) return failureFromOutcome(nameStatus);
      if (!isSuccess(numstat)) return failureFromOutcome(numstat);
      if (!isSuccess(untracked)) return failureFromOutcome(untracked);

      const counts = parseNumstatZ(numstat.stdout.toString("utf8"));
      const tracked: TuiReviewFile[] = parseNameStatusZ(nameStatus.stdout.toString("utf8")).map(
        (entry) => {
          const count = counts.get(entry.path);
          return {
            additions: count?.additions ?? 0,
            binary: count?.binary ?? false,
            deletions: count?.deletions ?? 0,
            path: entry.path,
            ...(entry.previousPath ? { previousPath: entry.previousPath } : {}),
            status: entry.status,
          };
        },
      );
      const untrackedPaths = untracked.stdout
        .toString("utf8")
        .split("\0")
        .filter((path) => path.length > 0);
      const all = [...tracked, ...untrackedPaths.map((path) => untrackedFile(path))].sort(
        (left, right) => left.path.localeCompare(right.path),
      );
      const files = all.slice(0, REVIEW_MAX_FILES);
      for (const file of files) {
        if (file.status === "untracked") await countUntracked(readFile, repo.root, file);
      }
      return {
        kind: "ok",
        snapshot: {
          files,
          root: repo.root,
          totalAdditions: files.reduce((sum, file) => sum + file.additions, 0),
          totalDeletions: files.reduce((sum, file) => sum + file.deletions, 0),
          truncated:
            all.length > files.length ||
            nameStatus.truncated ||
            numstat.truncated ||
            untracked.truncated,
        },
      };
    },

    async loadFileDiff(file, diffOptions) {
      const signal = diffOptions?.abortSignal;
      const repo = await resolveRepo(signal);
      if ("kind" in repo) return repo;
      if (file.status === "untracked") {
        return await loadUntrackedDiff(readFile, repo.root, file);
      }
      const paths = file.previousPath ? [file.previousPath, file.path] : [file.path];
      const outcome = await run(
        [...DIFF_COMMON_ARGS, "--unified=3", repo.base, "--", ...paths],
        repo.root,
        REVIEW_DIFF_MAX_BYTES,
        signal,
      );
      if (!isSuccess(outcome)) return failureFromOutcome(outcome);
      return {
        kind: "ok",
        ...parseUnifiedDiff(outcome.stdout.toString("utf8"), {
          maxLines: REVIEW_DIFF_MAX_LINES,
          outputTruncated: outcome.truncated,
        }),
      };
    },
  };
}

function untrackedFile(path: string): TuiReviewFile {
  return { additions: 0, binary: false, deletions: 0, path, status: "untracked" };
}

async function countUntracked(readFile: FileReader, root: string, file: TuiReviewFile) {
  try {
    const read = await readFile(join(root, file.path), UNTRACKED_COUNT_MAX_BYTES);
    file.binary = isBinaryContent(read.content);
    file.additions = file.binary ? 0 : countTextLines(read.content);
  } catch {
    // Vanished or unreadable since `ls-files` ran: keep the row with zero counts.
  }
}

async function loadUntrackedDiff(
  readFile: FileReader,
  root: string,
  file: TuiReviewFile,
): Promise<TuiReviewFileDiffResult> {
  try {
    const read = await readFile(join(root, file.path), REVIEW_DIFF_MAX_BYTES);
    return {
      kind: "ok",
      ...buildUntrackedFileDiff(read.content, {
        contentTruncated: read.truncated,
        maxLines: REVIEW_DIFF_MAX_LINES,
      }),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === NOT_FOUND_ERROR_CODE) {
      return { binary: false, hunks: [], kind: "ok", truncated: false };
    }
    return { kind: "git_failed" };
  }
}

type CompletedOutcome = Extract<GitRunOutcome, { kind: "completed" }>;

function isSuccess(outcome: GitRunOutcome): outcome is CompletedOutcome {
  return outcome.kind === "completed" && outcome.exitCode === 0;
}

function failureFromOutcome(outcome: GitRunOutcome): TuiReviewFailure {
  if (outcome.kind === "spawn_failed") return { kind: "git_unavailable" };
  if (outcome.kind === "timed_out") return { kind: "git_failed", timedOut: true };
  if (outcome.kind === "aborted") return { kind: "git_failed" };
  return { exitCode: outcome.exitCode, kind: "git_failed" };
}

/**
 * Reads at most `maxBytes` (+1 to detect truncation) without loading huge files whole. Like git,
 * a symlink is shown as its target path (never followed), and non-regular files (FIFOs, sockets,
 * devices) are shown empty — opening a FIFO would block the review forever.
 */
export const readFileCapped: FileReader = async (path, maxBytes) => {
  const info = await lstat(path);
  if (info.isSymbolicLink()) {
    return { content: Buffer.from(`${await readlink(path)}\n`, "utf8"), truncated: false };
  }
  if (!info.isFile()) return { content: Buffer.alloc(0), truncated: false };
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes + 1, 0);
    return {
      content: buffer.subarray(0, Math.min(bytesRead, maxBytes)),
      truncated: bytesRead > maxBytes,
    };
  } finally {
    await handle.close();
  }
};

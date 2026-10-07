// Bounded git subprocess runner for /review (specs/tui/diff-review-undo.md §1).
// Argument arrays only (no shell), async, with a hard timeout and an stdout byte cap. Output
// beyond the cap is not an error: the result is flagged `truncated` so callers can show a notice.
import { spawn } from "node:child_process";

const GIT_EXECUTABLE = "git";
const KILL_SIGNAL = "SIGTERM";
const STDERR_LIMIT_BYTES = 4096;

export type GitRunOutcome =
  | {
      kind: "completed";
      exitCode: number;
      stderr: string;
      stdout: Buffer;
      truncated: boolean;
    }
  | { kind: "aborted" }
  | { kind: "spawn_failed"; code?: string }
  | { kind: "timed_out" };

export type GitRunOptions = {
  abortSignal?: AbortSignal;
  cwd: string;
  maxOutputBytes: number;
  timeoutMs: number;
};

export type GitRunner = (args: readonly string[], options: GitRunOptions) => Promise<GitRunOutcome>;

/**
 * Global flags applied to every review git call: never page, and treat pathspecs literally (a
 * file named `*.ts` is not a glob). `GIT_OPTIONAL_LOCKS=0` in the environment additionally keeps
 * a review from taking the index lock the user's own git commands may need.
 */
export const REVIEW_GIT_GLOBAL_ARGS = ["--no-pager", "--literal-pathspecs"] as const;

export const runGit: GitRunner = (args, options) =>
  new Promise<GitRunOutcome>((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(GIT_EXECUTABLE, [...REVIEW_GIT_GLOBAL_ARGS, ...args], {
        cwd: options.cwd,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (error) {
      resolve({ kind: "spawn_failed", code: (error as NodeJS.ErrnoException).code });
      return;
    }

    const chunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderr = "";
    let truncated = false;
    let settled = false;

    const finish = (outcome: GitRunOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.abortSignal?.removeEventListener("abort", onAbort);
      resolve(outcome);
    };
    const onAbort = (): void => {
      child.kill(KILL_SIGNAL);
      finish({ kind: "aborted" });
    };
    const timer = setTimeout(() => {
      child.kill(KILL_SIGNAL);
      finish({ kind: "timed_out" });
    }, options.timeoutMs);
    options.abortSignal?.addEventListener("abort", onAbort, { once: true });

    child.stdout?.on("data", (chunk: Buffer) => {
      if (truncated) return;
      const remaining = options.maxOutputBytes - stdoutBytes;
      if (chunk.length > remaining) {
        chunks.push(chunk.subarray(0, Math.max(0, remaining)));
        stdoutBytes = options.maxOutputBytes;
        truncated = true;
        // Enough output for the cap; stop git instead of buffering the rest.
        child.kill(KILL_SIGNAL);
        return;
      }
      chunks.push(chunk);
      stdoutBytes += chunk.length;
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < STDERR_LIMIT_BYTES) stderr += chunk.toString("utf8");
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      finish({ kind: "spawn_failed", code: error.code });
    });
    child.on("close", (exitCode) => {
      finish({
        exitCode: truncated ? 0 : (exitCode ?? -1),
        kind: "completed",
        stderr: stderr.slice(0, STDERR_LIMIT_BYTES),
        stdout: Buffer.concat(chunks),
        truncated,
      });
    });
  });

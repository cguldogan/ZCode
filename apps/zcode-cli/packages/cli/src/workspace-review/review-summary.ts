// Plain-text rendering of a /review listing, used by `zcode -p "/review"` and by the command
// center when no interactive review view is available (specs/tui/diff-review-undo.md §1).
import type { TuiReviewFailure, TuiReviewFile, TuiReviewListResult } from "@zcode/tui";

const STATUS_LETTER: Record<TuiReviewFile["status"], string> = {
  added: "A",
  copied: "C",
  deleted: "D",
  modified: "M",
  renamed: "R",
  type_changed: "T",
  unmerged: "U",
  untracked: "?",
};

export function reviewStatusLetter(status: TuiReviewFile["status"]): string {
  return STATUS_LETTER[status];
}

export function formatReviewCounts(file: TuiReviewFile): string {
  return file.binary ? "bin" : `+${file.additions} -${file.deletions}`;
}

export function reviewFileLabel(file: TuiReviewFile): string {
  return file.previousPath ? `${file.previousPath} -> ${file.path}` : file.path;
}

export function formatReviewFailure(failure: TuiReviewFailure): string {
  if (failure.kind === "not_git_repo") return `Not a git repository: ${failure.directory}`;
  if (failure.kind === "git_unavailable") return "git is not available on PATH.";
  if (failure.timedOut) return "git timed out while reading changes.";
  return failure.exitCode === undefined
    ? "git failed while reading changes."
    : `git failed while reading changes (exit code ${failure.exitCode}).`;
}

export function formatWorkspaceReviewSummary(result: TuiReviewListResult): {
  ok: boolean;
  text: string;
} {
  if (result.kind !== "ok") return { ok: false, text: formatReviewFailure(result) };
  const { snapshot } = result;
  if (snapshot.files.length === 0) {
    return { ok: true, text: `No uncommitted changes in ${snapshot.root}.` };
  }
  const fileWord = snapshot.files.length === 1 ? "file" : "files";
  const lines = [
    `Uncommitted changes in ${snapshot.root}: ${snapshot.files.length} ${fileWord}, +${snapshot.totalAdditions} -${snapshot.totalDeletions}`,
    ...snapshot.files.map(
      (file) =>
        `  ${reviewStatusLetter(file.status)}  ${reviewFileLabel(file)}  ${formatReviewCounts(file)}`,
    ),
  ];
  if (snapshot.truncated) lines.push("  (list truncated)");
  lines.push("Open the TUI and run /review to browse the diffs.");
  return { ok: true, text: lines.join("\n") };
}

// Pure parsers for /review git output (specs/tui/diff-review-undo.md §1). No I/O here so every
// format quirk (renames, binary, -z records, truncated output) is unit-testable.
import type { TuiReviewDiffHunk, TuiReviewFileStatus } from "@zcode/tui";

const NUL = "\0";
const TAB = "\t";
const BINARY_COUNT_MARKER = "-";
const BINARY_SNIFF_BYTES = 8000;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const BINARY_DIFF_PREFIXES = ["Binary files ", "GIT binary patch"];
const NO_NEWLINE_MARKER = "\\";
const FILE_HEADER_PREFIX = "diff --git ";

const STATUS_BY_LETTER: Record<string, TuiReviewFileStatus> = {
  A: "added",
  C: "copied",
  D: "deleted",
  M: "modified",
  R: "renamed",
  T: "type_changed",
  U: "unmerged",
};

export type NameStatusEntry = {
  path: string;
  previousPath?: string;
  status: TuiReviewFileStatus;
};

export type NumstatEntry = {
  additions: number;
  binary: boolean;
  deletions: number;
};

export type ParsedFileDiff = {
  binary: boolean;
  hunks: TuiReviewDiffHunk[];
  truncated: boolean;
};

/** `git diff --name-status -z`: `M\0path\0`, `R100\0old\0new\0`, `C75\0old\0new\0`. */
export function parseNameStatusZ(output: string): NameStatusEntry[] {
  const tokens = splitNul(output);
  const entries: NameStatusEntry[] = [];
  let index = 0;
  while (index < tokens.length) {
    const code = tokens[index] ?? "";
    const letter = code.charAt(0);
    const status = STATUS_BY_LETTER[letter] ?? "modified";
    if (letter === "R" || letter === "C") {
      const previousPath = tokens[index + 1];
      const path = tokens[index + 2];
      index += 3;
      if (previousPath !== undefined && path !== undefined) {
        entries.push({ path, previousPath, status });
      }
      continue;
    }
    const path = tokens[index + 1];
    index += 2;
    if (path !== undefined) entries.push({ path, status });
  }
  return entries;
}

/**
 * `git diff --numstat -z`: `added\tdeleted\tpath\0`, or for renames/copies
 * `added\tdeleted\t\0old\0new\0`. Binary files report `-\t-`. Keyed by the new path.
 */
export function parseNumstatZ(output: string): Map<string, NumstatEntry> {
  const tokens = splitNul(output);
  const entries = new Map<string, NumstatEntry>();
  let index = 0;
  while (index < tokens.length) {
    const record = tokens[index] ?? "";
    index += 1;
    const [added = "", deleted = "", ...rest] = record.split(TAB);
    const inlinePath = rest.join(TAB);
    let path = inlinePath;
    if (inlinePath.length === 0) {
      // Rename/copy record: the two following tokens are old and new path.
      path = tokens[index + 1] ?? "";
      index += 2;
    }
    if (path.length === 0) continue;
    const binary = added === BINARY_COUNT_MARKER || deleted === BINARY_COUNT_MARKER;
    entries.set(path, {
      additions: binary ? 0 : toCount(added),
      binary,
      deletions: binary ? 0 : toCount(deleted),
    });
  }
  return entries;
}

/**
 * Parses one file's unified diff into hunks for ShikiDiffView. `outputTruncated` means the git
 * output was cut at the byte cap, so the last line may be partial and is dropped.
 */
export function parseUnifiedDiff(
  output: string,
  options: { maxLines: number; outputTruncated: boolean },
): ParsedFileDiff {
  const lines = output.split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (options.outputTruncated) lines.pop();

  const hunks: TuiReviewDiffHunk[] = [];
  let current: TuiReviewDiffHunk | undefined;
  let rowCount = 0;
  let truncated = options.outputTruncated;
  let fileSections = 0;

  for (const rawLine of lines) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.startsWith(FILE_HEADER_PREFIX)) {
      fileSections += 1;
      // A single-file request must yield one section; anything else is ignored defensively.
      if (fileSections > 1) break;
      current = undefined;
      continue;
    }
    if (!current && BINARY_DIFF_PREFIXES.some((prefix) => line.startsWith(prefix))) {
      return { binary: true, hunks: [], truncated: false };
    }
    const header = HUNK_HEADER.exec(line);
    if (header) {
      current = {
        lines: [],
        newLines: toCount(header[4] ?? "1"),
        newStart: toCount(header[3] ?? "0"),
        oldLines: toCount(header[2] ?? "1"),
        oldStart: toCount(header[1] ?? "0"),
      };
      hunks.push(current);
      continue;
    }
    if (!current || line.startsWith(NO_NEWLINE_MARKER)) continue;
    const marker = line.charAt(0);
    if (marker !== "+" && marker !== "-" && marker !== " " && line.length > 0) continue;
    if (rowCount >= options.maxLines) {
      truncated = true;
      break;
    }
    current.lines.push(line.length === 0 ? " " : line);
    rowCount += 1;
  }

  return { binary: false, hunks: hunks.filter((hunk) => hunk.lines.length > 0), truncated };
}

/** Untracked file → one all-additions hunk (or binary). `contentTruncated` = read was capped. */
export function buildUntrackedFileDiff(
  content: Buffer,
  options: { contentTruncated: boolean; maxLines: number },
): ParsedFileDiff {
  if (isBinaryContent(content)) return { binary: true, hunks: [], truncated: false };
  const lines = splitTextLines(content.toString("utf8"));
  if (options.contentTruncated) lines.pop();
  const shown = lines.slice(0, options.maxLines);
  const truncated = options.contentTruncated || lines.length > shown.length;
  if (shown.length === 0) return { binary: false, hunks: [], truncated };
  return {
    binary: false,
    hunks: [
      {
        lines: shown.map((line) => `+${line}`),
        newLines: shown.length,
        newStart: 1,
        oldLines: 0,
        oldStart: 0,
      },
    ],
    truncated,
  };
}

export function isBinaryContent(content: Buffer): boolean {
  return content.subarray(0, BINARY_SNIFF_BYTES).includes(0);
}

export function countTextLines(content: Buffer): number {
  return splitTextLines(content.toString("utf8")).length;
}

function splitTextLines(text: string): string[] {
  if (text.length === 0) return [];
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function splitNul(output: string): string[] {
  const tokens = output.split(NUL);
  if (tokens.at(-1) === "") tokens.pop();
  return tokens;
}

function toCount(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

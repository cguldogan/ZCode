// /review full-screen view (specs/tui/diff-review-undo.md §1): change list and per-file diff.
// Rendering only; state lives in app-review-state.ts and the diff body reuses ShikiDiffView.
import { useTerminalDimensions } from "@mbears/opentui-react";
import type { TuiCopy } from "@zcode/i18n";
import React from "react";
import { palette } from "./app-model.js";
import type { ReviewPanelController } from "./app-review-panel.js";
import { reviewFiles, selectedReviewFile, type ReviewPanelState } from "./app-review-state.js";
import { visibleSelectionItemWindow } from "./app-selection-keyboard.js";
import { ShikiDiffView } from "./app-shiki-diff-view.js";
import { displayWidth, truncateDisplay } from "./app-terminal-width.js";
import type { TuiReviewFailure, TuiReviewFile } from "./types.js";

const h = React.createElement as (
  type: React.ElementType | string,
  props?: Record<string, unknown> | null,
  ...children: React.ReactNode[]
) => React.ReactElement;

/** Title, help, optional notice and borders around the list. */
const REVIEW_CHROME_ROWS = 8;
const REVIEW_MIN_VISIBLE_ROWS = 3;
const SELECTOR_WIDTH = 2;
const STATUS_WIDTH = 3;
const COUNT_GAP = 2;

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

export function ReviewView(props: {
  contentWidth: number;
  controller: ReviewPanelController;
  copy: TuiCopy;
  pendingApproval: boolean;
}): React.ReactElement | null {
  const { height } = useTerminalDimensions();
  const state = props.controller.state;
  if (!state) return null;
  const labels = props.copy.review;
  const listing = state.listing;
  const summary =
    listing?.kind === "ok"
      ? `${listing.snapshot.root}  ${labels.summary({
          additions: listing.snapshot.totalAdditions,
          deletions: listing.snapshot.totalDeletions,
          files: listing.snapshot.files.length,
        })}`
      : "";
  return h(
    "box",
    { id: "review-view", style: { flexDirection: "column", flexGrow: 1, minHeight: 0 } },
    h(
      "text",
      { style: { fg: palette.accent, flexShrink: 0, height: 1 } },
      truncateDisplay(`${labels.title.trim()}  ${summary}`, props.contentWidth),
    ),
    h(
      "text",
      { style: { fg: palette.muted, flexShrink: 0, height: 1 } },
      truncateDisplay(
        state.view === "diff" ? labels.diffHelp : labels.listHelp,
        props.contentWidth,
      ),
    ),
    props.pendingApproval
      ? h("text", { style: { fg: palette.warning, flexShrink: 0 } }, labels.pendingApproval)
      : null,
    state.view === "diff"
      ? h(ReviewDiffBody, { ...props, state })
      : h(ReviewList, {
          contentWidth: props.contentWidth,
          copy: props.copy,
          maxVisible: Math.max(REVIEW_MIN_VISIBLE_ROWS, height - REVIEW_CHROME_ROWS),
          state,
        }),
  );
}

function ReviewList(props: {
  contentWidth: number;
  copy: TuiCopy;
  maxVisible: number;
  state: ReviewPanelState;
}): React.ReactElement {
  const labels = props.copy.review;
  const listing = props.state.listing;
  if (!listing) return message(labels.loading, palette.muted);
  if (listing.kind !== "ok") return message(failureText(listing, props.copy), palette.danger);
  const files = reviewFiles(props.state);
  if (files.length === 0) return message(labels.empty, palette.muted);
  const window = visibleSelectionItemWindow(files, props.state.selectedIndex, props.maxVisible);
  return h(
    "box",
    { style: { flexDirection: "column", flexGrow: 1, minHeight: 0 } },
    ...window.items.map((file, index) =>
      h(ReviewRow, {
        contentWidth: props.contentWidth,
        file,
        key: `${file.previousPath ?? ""}\0${file.path}`,
        selected: index === window.selectedIndex,
      }),
    ),
    listing.snapshot.truncated
      ? h("text", { key: "truncated", style: { fg: palette.warning } }, labels.listTruncated)
      : null,
  );
}

function ReviewRow(props: {
  contentWidth: number;
  file: TuiReviewFile;
  selected: boolean;
}): React.ReactElement {
  const counts = countLabel(props.file);
  const pathBudget = Math.max(
    1,
    props.contentWidth - SELECTOR_WIDTH - STATUS_WIDTH - COUNT_GAP - displayWidth(counts),
  );
  const color = props.selected ? palette.accent : palette.text;
  return h(
    "box",
    { style: { flexDirection: "row", height: 1, width: "100%" } },
    h(
      "text",
      { style: { fg: color, flexShrink: 0, width: SELECTOR_WIDTH } },
      props.selected ? "> " : "  ",
    ),
    h(
      "text",
      { style: { fg: statusColor(props.file), flexShrink: 0, width: STATUS_WIDTH } },
      STATUS_LETTER[props.file.status],
    ),
    h(
      "text",
      { style: { fg: color, flexGrow: 1, flexShrink: 1 } },
      truncateDisplay(fileLabel(props.file), pathBudget),
    ),
    h("text", { style: { fg: palette.muted, flexShrink: 0, marginLeft: COUNT_GAP } }, counts),
  );
}

function ReviewDiffBody(props: {
  contentWidth: number;
  controller: ReviewPanelController;
  copy: TuiCopy;
  state: ReviewPanelState;
}): React.ReactElement {
  const labels = props.copy.review;
  const file = selectedReviewFile(props.state);
  const diff = props.state.diff;
  const header = file
    ? h(
        "text",
        { style: { fg: palette.text, flexShrink: 0, height: 1 } },
        truncateDisplay(
          `${STATUS_LETTER[file.status]}  ${fileLabel(file)}  ${countLabel(file)}`,
          props.contentWidth,
        ),
      )
    : null;
  const body = (() => {
    if (!file || !diff || diff.status === "loading") {
      return message(labels.loadingDiff, palette.muted);
    }
    const result = diff.result;
    if (result.kind !== "ok") return message(failureText(result, props.copy), palette.danger);
    if (result.binary) return message(labels.binary, palette.muted);
    if (result.hunks.length === 0) return message(labels.noTextChanges, palette.muted);
    return h(
      "scrollbox",
      {
        focused: true,
        key: `${file.path}:${props.state.requestId}`,
        ref: props.controller.scrollRef,
        style: {
          backgroundColor: palette.background,
          flexGrow: 1,
          minHeight: 3,
          contentOptions: { backgroundColor: palette.background, flexDirection: "column" },
          scrollbarOptions: { showArrows: true },
        },
      },
      h(ShikiDiffView, {
        filePath: file.path,
        structuredPatch: result.hunks,
        terminalWidth: props.contentWidth,
      }),
      result.truncated
        ? h("text", { key: "truncated", style: { fg: palette.warning } }, labels.diffTruncated)
        : null,
    );
  })();
  return h("box", { style: { flexDirection: "column", flexGrow: 1, minHeight: 0 } }, header, body);
}

function message(text: string, color: string): React.ReactElement {
  return h("text", { style: { fg: color, wrapMode: "word" } }, text);
}

function failureText(failure: TuiReviewFailure, copy: TuiCopy): string {
  if (failure.kind === "not_git_repo") return copy.review.notGitRepo(failure.directory);
  if (failure.kind === "git_unavailable") return copy.review.gitUnavailable;
  return copy.review.gitFailed({ exitCode: failure.exitCode, timedOut: failure.timedOut });
}

function fileLabel(file: TuiReviewFile): string {
  return file.previousPath ? `${file.previousPath} -> ${file.path}` : file.path;
}

function countLabel(file: TuiReviewFile): string {
  return file.binary ? "bin" : `+${file.additions} -${file.deletions}`;
}

function statusColor(file: TuiReviewFile): string {
  if (file.status === "deleted") return palette.danger;
  if (file.status === "added" || file.status === "untracked") return palette.success;
  return palette.warning;
}

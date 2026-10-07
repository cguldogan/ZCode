// Transient /review view state (specs/tui/diff-review-undo.md §1). Pure reducer: keys and load
// results in, next state and at most one effect out. The hook in app-review-panel.ts executes
// effects; nothing here touches git or the renderer, so the keyboard contract is unit-tested.
import { clampIndex } from "./app-selection-keyboard.js";
import type { TuiReviewFile, TuiReviewFileDiffResult, TuiReviewListResult } from "./types.js";

export const REVIEW_PAGE_SIZE = 10;

export type ReviewDiffState =
  | { status: "loading" }
  | { result: TuiReviewFileDiffResult; status: "ready" };

export type ReviewPanelState = {
  diff?: ReviewDiffState;
  /** `undefined` while the change list is loading. */
  listing?: TuiReviewListResult;
  /**
   * Monotonic load generation. Every list/diff request takes a new id and results carrying an
   * older id are dropped, so a slow git call can never overwrite a newer view.
   */
  requestId: number;
  selectedIndex: number;
  view: "diff" | "list";
};

export type ReviewEffect =
  | { type: "close" }
  | { requestId: number; type: "loadList" }
  | { file: TuiReviewFile; requestId: number; type: "loadDiff" }
  | { delta: number; type: "scroll" };

export type ReviewKey = {
  ctrl?: boolean;
  meta?: boolean;
  name: string;
  sequence?: string;
  shift?: boolean;
};

export type ReviewKeyResult = {
  /** False when the key must reach the focused diff scrollbox (native scrolling). */
  consumed: boolean;
  effect?: ReviewEffect;
  state: ReviewPanelState;
};

const NATIVE_SCROLL_KEYS = new Set(["down", "end", "home", "pagedown", "pageup", "up"]);

export function openReviewPanel(previous?: ReviewPanelState): {
  effect: ReviewEffect;
  state: ReviewPanelState;
} {
  const requestId = (previous?.requestId ?? 0) + 1;
  return {
    effect: { requestId, type: "loadList" },
    state: { requestId, selectedIndex: 0, view: "list" },
  };
}

export function reviewFiles(state: ReviewPanelState): readonly TuiReviewFile[] {
  return state.listing?.kind === "ok" ? state.listing.snapshot.files : [];
}

export function selectedReviewFile(state: ReviewPanelState): TuiReviewFile | undefined {
  return reviewFiles(state)[state.selectedIndex];
}

export function applyReviewListing(
  state: ReviewPanelState,
  requestId: number,
  listing: TuiReviewListResult,
): ReviewPanelState {
  if (requestId !== state.requestId) return state;
  const count = listing.kind === "ok" ? listing.snapshot.files.length : 0;
  return { ...state, listing, selectedIndex: clampIndex(state.selectedIndex, count) };
}

export function applyReviewDiff(
  state: ReviewPanelState,
  requestId: number,
  result: TuiReviewFileDiffResult,
): ReviewPanelState {
  if (requestId !== state.requestId || state.view !== "diff") return state;
  return { ...state, diff: { result, status: "ready" } };
}

export function reduceReviewKey(state: ReviewPanelState, key: ReviewKey): ReviewKeyResult {
  if (key.ctrl || key.meta) return { consumed: false, state };
  return state.view === "diff" ? reduceDiffKey(state, key) : reduceListKey(state, key);
}

function reduceListKey(state: ReviewPanelState, key: ReviewKey): ReviewKeyResult {
  const count = reviewFiles(state).length;
  const move = (index: number): ReviewKeyResult => ({
    consumed: true,
    state: { ...state, selectedIndex: clampIndex(index, count) },
  });
  const char = keyChar(key);
  if (key.name === "escape" || char === "q") {
    return { consumed: true, effect: { type: "close" }, state };
  }
  if (char === "r") return reload(state);
  if (key.name === "up" || char === "k") return move(state.selectedIndex - 1);
  if (key.name === "down" || char === "j") return move(state.selectedIndex + 1);
  if (key.name === "pageup") return move(state.selectedIndex - REVIEW_PAGE_SIZE);
  if (key.name === "pagedown") return move(state.selectedIndex + REVIEW_PAGE_SIZE);
  if (key.name === "home" || char === "g") return move(0);
  if (key.name === "end" || char === "G") return move(count - 1);
  if (key.name === "return" || key.name === "right" || char === "l") {
    return openDiff(state, state.selectedIndex);
  }
  return { consumed: true, state };
}

function reduceDiffKey(state: ReviewPanelState, key: ReviewKey): ReviewKeyResult {
  const char = keyChar(key);
  if (
    key.name === "escape" ||
    key.name === "left" ||
    key.name === "backspace" ||
    char === "h" ||
    char === "q"
  ) {
    // A new id also invalidates a diff load that is still in flight.
    return {
      consumed: true,
      state: { ...state, diff: undefined, requestId: state.requestId + 1, view: "list" },
    };
  }
  if (char === "j") return { consumed: true, effect: { delta: 1, type: "scroll" }, state };
  if (char === "k") return { consumed: true, effect: { delta: -1, type: "scroll" }, state };
  if (char === "n" || char === "]") return openDiff(state, state.selectedIndex + 1);
  if (char === "p" || char === "[") return openDiff(state, state.selectedIndex - 1);
  if (char === "r") return openDiff(state, state.selectedIndex);
  if (NATIVE_SCROLL_KEYS.has(key.name)) return { consumed: false, state };
  return { consumed: true, state };
}

function openDiff(state: ReviewPanelState, index: number): ReviewKeyResult {
  const files = reviewFiles(state);
  const file = files[index];
  if (!file) return { consumed: true, state };
  const requestId = state.requestId + 1;
  return {
    consumed: true,
    effect: { file, requestId, type: "loadDiff" },
    state: { ...state, diff: { status: "loading" }, requestId, selectedIndex: index, view: "diff" },
  };
}

function reload(state: ReviewPanelState): ReviewKeyResult {
  const requestId = state.requestId + 1;
  return {
    consumed: true,
    effect: { requestId, type: "loadList" },
    state: { ...state, diff: undefined, listing: undefined, requestId, view: "list" },
  };
}

/** Printable character of a key; Shift+g arrives as name "g" with shift set. */
function keyChar(key: ReviewKey): string | undefined {
  if (key.name.length === 1) return key.shift ? key.name.toUpperCase() : key.name;
  if (key.sequence && key.sequence.length === 1) return key.sequence;
  return undefined;
}

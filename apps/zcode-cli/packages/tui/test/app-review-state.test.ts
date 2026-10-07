// specs/tui/diff-review-undo.md §1 and §3 — /review keyboard reducer and diff layout selection.
import assert from "node:assert/strict";
import test from "node:test";
import { resolveDiffViewMode, SPLIT_DIFF_WIDTH_BREAKPOINT } from "../src/app-diff-style.js";
import {
  applyReviewDiff,
  applyReviewListing,
  openReviewPanel,
  reduceReviewKey,
  selectedReviewFile,
  type ReviewKey,
  type ReviewPanelState,
} from "../src/app-review-state.js";
import { isReviewCommand } from "../src/app-submit-controller.js";
import type { TuiReviewFile, TuiReviewListResult } from "../src/types.js";

const files: TuiReviewFile[] = ["a.ts", "b.ts", "c.ts"].map((path) => ({
  additions: 1,
  binary: false,
  deletions: 0,
  path,
  status: "modified",
}));
const listing: TuiReviewListResult = {
  kind: "ok",
  snapshot: { files, root: "/repo", totalAdditions: 3, totalDeletions: 0, truncated: false },
};

function loaded(): ReviewPanelState {
  const opened = openReviewPanel();
  assert.deepEqual(opened.effect, { requestId: 1, type: "loadList" });
  return applyReviewListing(opened.state, 1, listing);
}

function press(state: ReviewPanelState, ...keys: Array<string | ReviewKey>) {
  let current = state;
  let last: ReturnType<typeof reduceReviewKey> | undefined;
  for (const key of keys) {
    last = reduceReviewKey(current, typeof key === "string" ? { name: key } : key);
    current = last.state;
  }
  return last!;
}

test("list navigation with arrows and j/k clamps at both ends", () => {
  const state = loaded();
  assert.equal(press(state, "down").state.selectedIndex, 1);
  assert.equal(press(state, "j", "j", "j", "j").state.selectedIndex, 2);
  assert.equal(press(state, "down", "up", "k", "k").state.selectedIndex, 0);
  assert.equal(press(state, { name: "g", shift: true }).state.selectedIndex, 2);
  assert.equal(press(state, "end", "home").state.selectedIndex, 0);
  assert.equal(press(state, "pagedown").state.selectedIndex, 2);
});

test("Enter opens the selected diff; Esc goes back; Esc again closes", () => {
  const opened = press(loaded(), "down", "return");
  assert.equal(opened.state.view, "diff");
  assert.deepEqual(opened.state.diff, { status: "loading" });
  assert.equal(opened.effect?.type, "loadDiff");
  assert.equal(opened.effect?.type === "loadDiff" && opened.effect.file.path, "b.ts");

  const back = reduceReviewKey(opened.state, { name: "escape" });
  assert.equal(back.state.view, "list");
  assert.equal(back.state.selectedIndex, 1);
  assert.equal(back.effect, undefined);

  const closed = reduceReviewKey(back.state, { name: "escape" });
  assert.deepEqual(closed.effect, { type: "close" });
});

test("diff view: n/p switch files, j/k scroll, arrows reach the native scrollbox", () => {
  const diff = press(loaded(), "return").state;
  const next = reduceReviewKey(diff, { name: "n" });
  assert.equal(selectedReviewFile(next.state)?.path, "b.ts");
  assert.equal(next.effect?.type, "loadDiff");
  assert.equal(selectedReviewFile(reduceReviewKey(next.state, { name: "p" }).state)?.path, "a.ts");
  // Past the last file nothing happens.
  const last = press(diff, "n", "n", "n").state;
  assert.equal(selectedReviewFile(last)?.path, "c.ts");

  assert.deepEqual(reduceReviewKey(diff, { name: "j" }).effect, { delta: 1, type: "scroll" });
  assert.deepEqual(reduceReviewKey(diff, { name: "k" }).effect, { delta: -1, type: "scroll" });
  assert.equal(reduceReviewKey(diff, { name: "pagedown" }).consumed, false);
  assert.equal(reduceReviewKey(diff, { name: "up" }).consumed, false);
  assert.equal(reduceReviewKey(diff, { name: "x" }).consumed, true);
});

test("ctrl and meta chords are not consumed by the review view", () => {
  assert.equal(reduceReviewKey(loaded(), { ctrl: true, name: "c" }).consumed, false);
});

test("stale load results are dropped", () => {
  const diff = press(loaded(), "return");
  const requestId = diff.effect?.type === "loadDiff" ? diff.effect.requestId : -1;
  // User moved on to the next file before the first diff arrived.
  const moved = reduceReviewKey(diff.state, { name: "n" }).state;
  const result = { binary: false, hunks: [], kind: "ok" as const, truncated: false };
  assert.equal(applyReviewDiff(moved, requestId, result), moved);
  const fresh = applyReviewDiff(moved, moved.requestId, result);
  assert.deepEqual(fresh.diff, { result, status: "ready" });

  const reloading = press(loaded(), "r");
  assert.equal(reloading.state.listing, undefined);
  assert.equal(applyReviewListing(reloading.state, 1, listing), reloading.state);
});

test("empty or failed listings keep the view closable", () => {
  const opened = openReviewPanel().state;
  const failed = applyReviewListing(opened, 1, { directory: "/tmp/x", kind: "not_git_repo" });
  assert.equal(press(failed, "return").effect, undefined);
  assert.deepEqual(press(failed, "q").effect, { type: "close" });
});

test("diff layout honors tui.diffStyle", () => {
  const wide = SPLIT_DIFF_WIDTH_BREAKPOINT + 40;
  const narrow = SPLIT_DIFF_WIDTH_BREAKPOINT - 40;
  assert.equal(resolveDiffViewMode("auto", wide), "split");
  assert.equal(resolveDiffViewMode("auto", narrow), "unified");
  assert.equal(resolveDiffViewMode("stacked", wide), "unified");
  assert.equal(resolveDiffViewMode("stacked", narrow), "unified");
  assert.equal(resolveDiffViewMode("bogus", wide), "split", "unknown values behave as auto");
  assert.equal(resolveDiffViewMode(undefined, wide), "split");
});

test("only a bare /review opens the local view", () => {
  assert.equal(isReviewCommand("/review"), true);
  assert.equal(isReviewCommand("  /REVIEW "), true);
  assert.equal(isReviewCommand("/review all"), false);
  assert.equal(isReviewCommand("/reviewer"), false);
});

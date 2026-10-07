import assert from "node:assert/strict";
import test from "node:test";
import {
  createDeleteHoldTracker,
  DELETE_HOLD_ACCELERATE_AFTER_MS,
  deleteKeyDirection,
  deleteWordAtCursor,
  type DeleteHoldKey,
  type DeleteStep,
} from "../src/app-delete-acceleration.js";

// Spec: specs/tui/hold-delete-acceleration.md

function key(overrides: Partial<DeleteHoldKey> = {}): DeleteHoldKey {
  return {
    name: "backspace",
    eventType: "press",
    source: "raw",
    ctrl: false,
    meta: false,
    option: false,
    shift: false,
    ...overrides,
  };
}

/** Feeds one event every `intervalMs` for `durationMs`; returns the step per event. */
function hold(
  tracker: ReturnType<typeof createDeleteHoldTracker>,
  options: {
    start: number;
    durationMs: number;
    intervalMs: number;
    event?: Partial<DeleteHoldKey>;
  },
): Array<{ at: number; step: DeleteStep | undefined }> {
  const steps: Array<{ at: number; step: DeleteStep | undefined }> = [];
  for (let at = options.start; at <= options.start + options.durationMs; at += options.intervalMs) {
    steps.push({ at: at - options.start, step: tracker.observe(key(options.event), at) });
  }
  return steps;
}

test("separate taps always delete single characters", () => {
  const tracker = createDeleteHoldTracker();
  for (let at = 0; at < 10_000; at += 800) {
    assert.equal(tracker.observe(key(), at), "char");
  }
});

test("legacy hold switches from characters to words after 3 seconds", () => {
  const tracker = createDeleteHoldTracker();
  const steps = hold(tracker, { start: 1_000, durationMs: 4_000, intervalMs: 50 });
  for (const { at, step } of steps) {
    assert.equal(step, at >= DELETE_HOLD_ACCELERATE_AFTER_MS ? "word" : "char", `at ${at}ms`);
  }
});

test("macOS initial repeat delay (375 ms) does not break the hold", () => {
  const tracker = createDeleteHoldTracker();
  assert.equal(tracker.observe(key(), 0), "char");
  // first auto-repeat after the initial delay, then the normal repeat interval
  const steps = hold(tracker, { start: 375, durationMs: 3_000, intervalMs: 90 });
  assert.equal(steps.at(-1)?.step, "word");
});

test("a pause longer than the repeat gap starts over", () => {
  const tracker = createDeleteHoldTracker();
  hold(tracker, { start: 0, durationMs: 3_500, intervalMs: 50 });
  assert.equal(tracker.observe(key(), 3_500 + 600), "char");
});

test("any other key or a modifier resets the hold", () => {
  const tracker = createDeleteHoldTracker();
  hold(tracker, { start: 0, durationMs: 3_500, intervalMs: 50 });
  assert.equal(tracker.observe(key({ name: "a" }), 3_520), undefined);
  assert.equal(tracker.observe(key(), 3_540), "char");

  hold(tracker, { start: 10_000, durationMs: 3_500, intervalMs: 50 });
  assert.equal(tracker.observe(key({ option: true }), 13_520), undefined);
  assert.equal(tracker.observe(key(), 13_540), "char");
});

test("switching between Backspace and Delete starts a new hold", () => {
  const tracker = createDeleteHoldTracker();
  hold(tracker, { start: 0, durationMs: 3_500, intervalMs: 50 });
  assert.equal(tracker.observe(key({ name: "delete" }), 3_520), "char");
});

test("forward Delete accelerates the same way", () => {
  const tracker = createDeleteHoldTracker();
  const steps = hold(tracker, {
    start: 0,
    durationMs: 3_200,
    intervalMs: 40,
    event: { name: "delete" },
  });
  assert.equal(steps.at(-1)?.step, "word");
});

test("kitty protocol: repeats continue, release and a fresh press start over", () => {
  const tracker = createDeleteHoldTracker();
  assert.equal(tracker.observe(key({ source: "kitty" }), 0), "char");
  const steps = hold(tracker, {
    start: 500,
    durationMs: 3_000,
    intervalMs: 50,
    event: { source: "kitty", eventType: "repeat" },
  });
  assert.equal(steps.at(-1)?.step, "word");

  assert.equal(tracker.observe(key({ source: "kitty", eventType: "release" }), 3_600), undefined);
  assert.equal(tracker.observe(key({ source: "kitty", eventType: "repeat" }), 3_620), "char");

  // Quick separate presses are distinguishable under kitty, unlike legacy input.
  for (let at = 10_000; at < 14_000; at += 50) {
    assert.equal(tracker.observe(key({ source: "kitty" }), at), "char");
  }
});

test("only plain Backspace/Delete are classified", () => {
  assert.equal(deleteKeyDirection(key()), "backward");
  assert.equal(deleteKeyDirection(key({ name: "delete" })), "forward");
  assert.equal(deleteKeyDirection(key({ ctrl: true })), undefined);
  assert.equal(deleteKeyDirection(key({ meta: true })), undefined);
  assert.equal(deleteKeyDirection(key({ shift: true })), undefined);
  assert.equal(deleteKeyDirection(key({ super: true })), undefined);
  assert.equal(deleteKeyDirection(key({ name: "x" })), undefined);
});

test("word deletion goes through the focused editor only", () => {
  const calls: string[] = [];
  const editor = {
    focused: true,
    deleteWordBackward: () => (calls.push("backward"), true),
    deleteWordForward: () => (calls.push("forward"), true),
  };
  assert.equal(deleteWordAtCursor(editor, "backward"), true);
  assert.equal(deleteWordAtCursor(editor, "forward"), true);
  assert.deepEqual(calls, ["backward", "forward"]);
  assert.equal(deleteWordAtCursor({ ...editor, focused: false }, "backward"), false);
  assert.equal(deleteWordAtCursor(null, "backward"), false);
  assert.deepEqual(calls, ["backward", "forward"]);
});

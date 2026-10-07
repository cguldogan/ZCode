import type { PromptInputEditor } from "./app-input-pane.js";

// Hold Backspace/Delete to delete faster: characters first, whole words after a sustained
// hold. Spec: specs/tui/hold-delete-acceleration.md.

export const DELETE_HOLD_ACCELERATE_AFTER_MS = 3_000;
/** Legacy terminals send repeats as plain presses; a larger gap means the key was let go. */
export const DELETE_HOLD_MAX_REPEAT_GAP_MS = 500;

export type DeleteDirection = "backward" | "forward";
export type DeleteStep = "char" | "word";

export interface DeleteHoldKey {
  readonly name: string;
  readonly eventType: "press" | "repeat" | "release";
  readonly source: "raw" | "kitty";
  readonly repeated?: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly option: boolean;
  readonly shift: boolean;
  readonly super?: boolean;
}

/** Plain Backspace/Delete only; modified variants keep their own bindings. */
export function deleteKeyDirection(key: DeleteHoldKey): DeleteDirection | undefined {
  if (key.ctrl || key.meta || key.option || key.shift || key.super) return undefined;
  if (key.name === "backspace") return "backward";
  if (key.name === "delete") return "forward";
  return undefined;
}

export interface DeleteHoldTracker {
  /**
   * Feed every key event (including releases and unrelated keys) in arrival order. Returns
   * the step the event should perform, or undefined when it is not a plain delete press.
   */
  observe(key: DeleteHoldKey, now: number): DeleteStep | undefined;
}

export function createDeleteHoldTracker(
  options: { readonly accelerateAfterMs?: number; readonly maxRepeatGapMs?: number } = {},
): DeleteHoldTracker {
  const accelerateAfterMs = options.accelerateAfterMs ?? DELETE_HOLD_ACCELERATE_AFTER_MS;
  const maxRepeatGapMs = options.maxRepeatGapMs ?? DELETE_HOLD_MAX_REPEAT_GAP_MS;
  let streak: { direction: DeleteDirection; startedAt: number; lastAt: number } | undefined;

  return {
    observe(key, now) {
      const direction = deleteKeyDirection(key);
      if (key.eventType === "release") {
        if (direction && streak?.direction === direction) streak = undefined;
        return undefined;
      }
      if (!direction) {
        streak = undefined;
        return undefined;
      }
      // Kitty reports repeats explicitly, so a fresh press always starts over; legacy input
      // only has timing to tell a held key from separate taps.
      const continues =
        streak?.direction === direction &&
        (key.source === "kitty"
          ? key.eventType === "repeat" || key.repeated === true
          : now - streak.lastAt <= maxRepeatGapMs);
      if (!continues || !streak) {
        streak = { direction, startedAt: now, lastAt: now };
        return "char";
      }
      streak.lastAt = now;
      return now - streak.startedAt >= accelerateAfterMs ? "word" : "char";
    },
  };
}

/** Deletes one word at the cursor through the editor, so undo and draft sync stay native. */
export function deleteWordAtCursor(
  editor: Pick<PromptInputEditor, "deleteWordBackward" | "deleteWordForward" | "focused"> | null,
  direction: DeleteDirection,
): boolean {
  if (!editor?.focused) return false;
  return direction === "backward" ? editor.deleteWordBackward() : editor.deleteWordForward();
}

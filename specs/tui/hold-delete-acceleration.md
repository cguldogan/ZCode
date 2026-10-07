# TUI: hold Delete/Backspace to delete faster

Status: accepted · Scope: `apps/zcode-cli/packages/tui` composer · Owner: TUI keyboard controls

## Product rule

Holding Backspace (or forward Delete) in the prompt composer deletes one
character per key repeat, as today. Once the key has been held for
**3 seconds**, each further repeat deletes a **whole word** instead (the same
step as Option/Alt+Backspace), until the key is released or another key is
pressed. This matches the long-press delete acceleration of mobile keyboards
(characters first, then words).

- Applies only to plain Backspace/Delete. Keys with Ctrl, Meta/Option, Super or
  Shift keep their existing bindings.
- Applies only when the composer has focus and no panel (approval, selection,
  suggestion, file mention) consumed the key first.
- Uses the editor's own word deletion, so undo/redo and the draft sync behave
  exactly like Option+Backspace.

## Hold detection

Terminals report no key-up in legacy mode; holding a key yields repeated press
events at the OS repeat rate.

| Terminal input             | Streak continues when                                  | Streak ends when                       |
| -------------------------- | ------------------------------------------------------ | -------------------------------------- |
| Kitty keyboard protocol    | event is `repeat` (or `repeated`) for the same key      | `release`, a new `press`, any other key |
| Legacy (raw escape bytes)  | same key again within **500 ms** of the previous event  | gap > 500 ms, any other key            |

500 ms covers macOS's default initial repeat delay (375 ms) and repeat
interval. Rapid deliberate tapping faster than that for 3 s is treated as a
hold, which is acceptable: the user is clearly deleting a lot.

## Ownership

- `app-delete-acceleration.ts`: pure tracker (`createDeleteHoldTracker`) and
  key classification; no timers, time is passed in.
- `app-keyboard.ts`: single owner of the tracker instance (one ref per TUI);
  observes every key event first (so release/other keys reset), then applies
  word deletion at the end of the key chain, after all panel handlers.
- Constants: `DELETE_HOLD_ACCELERATE_AFTER_MS = 3000`,
  `DELETE_HOLD_MAX_REPEAT_GAP_MS = 500`.

## Acceptance

1. Tap Backspace: one character deleted per tap.
2. Hold Backspace 2 s: characters only.
3. Hold Backspace > 3 s: words disappear one per repeat; releasing and pressing
   again starts over with characters.
4. Hold, then type a letter, then hold again: the timer restarts.
5. Option+Backspace and Ctrl+Backspace behave as before.
6. With an approval or selection panel open, Backspace still goes to the panel.

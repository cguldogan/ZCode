// specs/tui/diff-review-undo.md: command-center side of /review, /undo and /redo.
import type { TuiSubmitPromptResult } from "@zcode/tui";
import { attachCurrentSessionMetadata } from "../metadata.js";
import type { ReviewUndoCommandName } from "../slash-command-types.js";
import type { CommandCenterDeps, TuiSubmitOptions } from "../types.js";

const REVIEW_TUI_ONLY_MESSAGE =
  "/review opens an interactive view in the TUI. In prompt mode, `zcode -p /review` prints a text summary.";

/**
 * The TUI opens its review view for a bare `/review` before the command center runs; reaching
 * here means arguments were given or this client has no review view.
 */
export function handleReviewFallback(deps: CommandCenterDeps, args: string): TuiSubmitPromptResult {
  return {
    mode: deps.getMode?.(),
    response: args.length > 0 ? "Usage: /review" : REVIEW_TUI_ONLY_MESSAGE,
  };
}

/** /undo and /redo are owned by the session runtime; the CLI only validates and forwards. */
export async function handleTurnUndoCommand(
  command: { args: string; name: Exclude<ReviewUndoCommandName, "review"> },
  deps: CommandCenterDeps,
  options: TuiSubmitOptions,
): Promise<TuiSubmitPromptResult> {
  if (command.args.length > 0) {
    return { mode: deps.getMode?.(), response: `Usage: /${command.name}` };
  }
  const app = await deps.getApp();
  return attachCurrentSessionMetadata(
    await app.submitPrompt(`/${command.name}`, options),
    deps,
    app,
  );
}

/**
 * While a turn is running, input is steered into it as plain user text. /undo and /redo must not
 * reach the model that way (and must not race the turn's own edits), so they are refused.
 */
export function refuseTurnUndoWhileBusy(
  command: { name?: string; type: string } | null,
): TuiSubmitPromptResult | undefined {
  if (command?.type !== "known" || (command.name !== "undo" && command.name !== "redo")) {
    return undefined;
  }
  return {
    response: `/${command.name} is unavailable while the agent is working. Wait for the turn to finish or press Esc to interrupt it first.`,
  };
}

// `zcode -p "/review"`: print the change summary and exit without starting a session or a model
// turn (specs/tui/diff-review-undo.md §1, "Prompt mode").
import type { RunContext } from "@zcode/shared-types";
import type { TuiWorkspaceReview } from "@zcode/tui";
import { formatWorkspaceReviewSummary } from "./review-summary.js";
import { createWorkspaceReviewProvider } from "./workspace-review.js";

export async function runReviewSummaryCommand(
  ctx: Pick<RunContext, "stderr" | "stdout">,
  options: { args: string; provider?: TuiWorkspaceReview; workspaceDirectory: string },
): Promise<number> {
  if (options.args.length > 0) {
    ctx.stderr.write("Usage: /review\n");
    return 1;
  }
  const provider =
    options.provider ??
    createWorkspaceReviewProvider({ workspaceDirectory: options.workspaceDirectory });
  const summary = formatWorkspaceReviewSummary(await provider.listChanges());
  (summary.ok ? ctx.stdout : ctx.stderr).write(`${summary.text}\n`);
  return summary.ok ? 0 : 1;
}

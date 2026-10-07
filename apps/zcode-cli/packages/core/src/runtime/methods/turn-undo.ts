// /undo and /redo runtime commands (specs/tui/diff-review-undo.md §2).
//
// Owner of the behavior: the session runtime. Undo reuses applyWorkspaceFileRewind (the journaled,
// hash-checked file-summary rewind) scoped to one turn; redo replays the same checkpoints forward
// (turn-redo.ts). Which turn is targeted is derived from the event log by deriveTurnUndoState.
import { isAbsolute, relative } from "node:path";
import { createMessageId, traceContextToLogContext } from "../deps.js";
import type { TraceContext, TurnId } from "../deps.js";
import { deriveTurnUndoState, type TurnUndoState } from "../helpers/turn-undo-history.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { WorkspaceFileRewindUnsafeReason } from "../types.js";
import { sanitizeSystemReminderBody } from "../../system-reminder/source.js";
import { applyWorkspaceFileRewind } from "./file-rewind.js";
import { isPathInsideWorkspace, OUTSIDE_WORKSPACE_MESSAGE } from "./file-rewind-state.js";
import { applyTurnRedo, type TurnFileChange } from "./turn-redo.js";

export type TurnUndoAction = "undo" | "redo";

type CommandOptions = {
  abortSignal?: AbortSignal;
  traceContext: TraceContext;
};

const UNSAFE_REASON_TEXT: Record<WorkspaceFileRewindUnsafeReason, string> = {
  checkpoint_missing: "checkpoint missing",
  checkpoint_unreadable: "checkpoint unreadable",
  external_modified: "changed since the agent turn",
  file_read_failed: "could not be read",
  unsupported_checkpoint: "checkpoint cannot be replayed",
};

export async function executeTurnUndoCommand(
  runtime: AgentRuntimeInternal,
  command: { action: TurnUndoAction; args: string },
  options: CommandOptions,
): Promise<string> {
  if (command.args.length > 0) return `Usage: /${command.action}`;
  const state = deriveTurnUndoState(await runtime.eventStore.getEvents(runtime.sessionId), {
    lastAgentActivityAtMs: runtime.lastAssistantCompletedAtMs,
  });
  return command.action === "undo"
    ? await undoLatestTurn(runtime, state, options)
    : await redoLatestUndo(runtime, state, options);
}

async function undoLatestTurn(
  runtime: AgentRuntimeInternal,
  state: TurnUndoState,
  options: CommandOptions,
): Promise<string> {
  const turnId = state.undoTargetTurnId;
  if (!turnId) {
    return state.changedTurnIds.length === 0
      ? "Nothing to undo: no agent turn has changed files in this session."
      : "Nothing to undo: every agent turn's file changes are already undone.";
  }

  const result = await applyWorkspaceFileRewind.call(runtime, {
    abortSignal: options.abortSignal,
    targetTurnId: turnId,
    traceContext: options.traceContext,
    workspaceOnly: true,
  });
  const preview = result.preview;
  if (!result.applied) {
    logOutcome(runtime, options, "undo", "refused", preview.unsafeFiles.length);
    if (preview.unsafeFiles.length === 0 && preview.safeFiles.length === 0) {
      return "Nothing to undo: the latest changes were made by shell commands, which are not checkpointed.";
    }
    if (preview.unsafeFiles.length === 0) return `Undo failed: ${result.response}`;
    return formatRefusal(runtime, "Undo", preview.unsafeFiles);
  }

  const files: TurnFileChange[] = preview.safeFiles.map((file) => ({
    action: file.action === "delete" ? "delete" : "write",
    path: file.path,
  }));
  await recordModelNotice(runtime, "undo", files, options.traceContext);
  logOutcome(runtime, options, "undo", "completed", files.length);
  return [
    `Undid ${fileCount(files.length)} from ${turnLabel(state, turnId)}:`,
    ...formatFileLines(runtime, files),
    "Run /redo to re-apply them.",
  ].join("\n");
}

async function redoLatestUndo(
  runtime: AgentRuntimeInternal,
  state: TurnUndoState,
  options: CommandOptions,
): Promise<string> {
  const turnId = state.redoTargetTurnId;
  if (!turnId) {
    return state.undoneTurnIds.length === 0
      ? "Nothing to redo: no undone agent turn."
      : "Nothing to redo: the agent has run since the last /undo, so the undone changes can no longer be re-applied.";
  }

  const result = await applyTurnRedo(runtime, {
    abortSignal: options.abortSignal,
    traceContext: options.traceContext,
    turnId,
  });
  if (!result.applied) {
    logOutcome(runtime, options, "redo", "refused", result.unsafeFiles.length);
    if (result.writeFailure) {
      return `Redo failed while writing files; files already written were restored. ${result.writeFailure}`;
    }
    if (result.unsafeFiles.length === 0) {
      return "Nothing to redo: the undone turn has no replayable file changes.";
    }
    return formatRefusal(runtime, "Redo", result.unsafeFiles);
  }

  await recordModelNotice(runtime, "redo", result.changedFiles, options.traceContext);
  logOutcome(runtime, options, "redo", "completed", result.changedFiles.length);
  return [
    `Redid ${fileCount(result.changedFiles.length)} from ${turnLabel(state, turnId)}:`,
    ...formatFileLines(runtime, result.changedFiles),
  ].join("\n");
}

function formatRefusal(
  runtime: AgentRuntimeInternal,
  label: "Undo" | "Redo",
  unsafeFiles: ReadonlyArray<{ path: string; reason: WorkspaceFileRewindUnsafeReason }>,
): string {
  return [
    `${label} refused; no files were changed. These files are not in the expected state:`,
    ...unsafeFiles.map(
      (file) => `  ${displayPath(runtime, file.path)} (${unsafeFileDetail(runtime, file)})`,
    ),
    "Restore or commit your edits to these files first, or use /rewind.",
  ].join("\n");
}

/** Outside-workspace refusals are recognized structurally from the path, not from text. */
function unsafeFileDetail(
  runtime: AgentRuntimeInternal,
  file: { path: string; reason: WorkspaceFileRewindUnsafeReason },
): string {
  const outside =
    file.reason === "unsupported_checkpoint" &&
    isAbsolute(file.path) &&
    !isPathInsideWorkspace(runtime.workspaceRoot, file.path);
  return outside ? OUTSIDE_WORKSPACE_MESSAGE : UNSAFE_REASON_TEXT[file.reason];
}

function formatFileLines(runtime: AgentRuntimeInternal, files: TurnFileChange[]): string[] {
  return files.map(
    (file) =>
      `  ${file.action === "delete" ? "deleted" : "restored"} ${displayPath(runtime, file.path)}`,
  );
}

function displayPath(runtime: AgentRuntimeInternal, path: string): string {
  return isPathInsideWorkspace(runtime.workspaceRoot, path)
    ? relative(runtime.workspaceRoot, path)
    : path;
}

function turnLabel(state: TurnUndoState, turnId: TurnId): string {
  const preview = state.inputPreviewByTurn.get(turnId);
  return preview ? `the agent turn "${preview}"` : "the last agent turn";
}

function fileCount(count: number): string {
  return `${count} file${count === 1 ? "" : "s"}`;
}

/**
 * The conversation is not rewound, so the model must learn that files changed under it;
 * otherwise its next edit would be based on content that no longer exists.
 */
async function recordModelNotice(
  runtime: AgentRuntimeInternal,
  action: TurnUndoAction,
  files: TurnFileChange[],
  traceContext: TraceContext,
): Promise<void> {
  const verb = action === "undo" ? "reverted" : "re-applied";
  const body = sanitizeSystemReminderBody([
    `The user ran /${action}: file changes from an earlier agent turn were ${verb}.`,
    ...files.map((file) => `${file.action} ${displayPath(runtime, file.path)}`),
    "Re-read these files before editing them; their content changed outside your tool calls.",
  ]);
  await runtime.persistSyntheticUserNotice(createMessageId(), body, traceContext);
  runtime.messageHistory.addAttachment("rewind_notice", body);
}

function logOutcome(
  runtime: AgentRuntimeInternal,
  options: CommandOptions,
  action: TurnUndoAction,
  status: "completed" | "refused",
  fileTotal: number,
): void {
  runtime.logger?.info(`Turn ${action} ${status}`, {
    ...traceContextToLogContext(options.traceContext),
    event: `turn_${action}.${status}`,
    fileCount: fileTotal,
    module: "core.runtime",
    outcome: status,
    status: "completed",
  });
}

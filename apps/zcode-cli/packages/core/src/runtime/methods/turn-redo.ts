// /redo: re-apply the file changes of a previously undone agent turn
// (specs/tui/diff-review-undo.md §2). It replays the same workspace checkpoint artifacts that
// /undo reverted, forward instead of backward, with the mirrored safety rule: every file must
// still be exactly in the turn's before-state, otherwise nothing is written.
import {
  RewindScope,
  RewindStrategy,
  SessionEventType,
  parseCheckpointCreatedPayload,
  parseWorkspaceCheckpointArtifact,
} from "../deps.js";
import type {
  CheckpointCreatedPayload,
  TraceContext,
  TurnId,
  WorkspaceCheckpointArtifact,
} from "../deps.js";
import { throwIfTurnAborted } from "../helpers/turn-errors.js";
import { TURN_REDO_REWIND_REASON } from "../helpers/turn-undo-history.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { WorkspaceFileRewindUnsafeReason } from "../types.js";
import {
  compensateFileRewindJournal,
  hashContent,
  isIgnoredShellTool,
  isPathInsideWorkspace,
  OUTSIDE_WORKSPACE_MESSAGE,
  readCurrentFileState,
  resolveCheckpointAfterContent,
  resolveCheckpointFilePath,
  type FileRewindJournalEntry,
  type PlannedFileState,
} from "./file-rewind-state.js";

export interface TurnFileChange {
  action: "delete" | "write";
  path: string;
}

export interface TurnRedoUnsafeFile {
  message?: string;
  path: string;
  reason: WorkspaceFileRewindUnsafeReason;
}

export interface TurnRedoResult {
  applied: boolean;
  changedFiles: TurnFileChange[];
  ignoredFiles: string[];
  /** Set when a write failed and the journal restored the files already written. */
  writeFailure?: string;
  unsafeFiles: TurnRedoUnsafeFile[];
}

type RedoOperation = {
  afterContent: string | null;
  beforeContent: string | null;
  path: string;
};

export async function applyTurnRedo(
  runtime: AgentRuntimeInternal,
  options: { abortSignal?: AbortSignal; traceContext: TraceContext; turnId: TurnId },
): Promise<TurnRedoResult> {
  const result: TurnRedoResult = {
    applied: false,
    changedFiles: [],
    ignoredFiles: [],
    unsafeFiles: [],
  };
  if (!runtime.artifactStore || !runtime.fileSystemPort) {
    result.unsafeFiles.push({
      message: "Checkpoint storage or file-system access is not configured.",
      path: "workspace",
      reason: !runtime.artifactStore ? "checkpoint_unreadable" : "file_read_failed",
    });
    return result;
  }

  const checkpoints = await listTurnCheckpoints(runtime, options.turnId);
  const operations: RedoOperation[] = [];
  for (const checkpoint of checkpoints) {
    throwIfTurnAborted(options.abortSignal);
    const artifact = await readCheckpointArtifact(runtime, checkpoint, options, result);
    if (!artifact) continue;
    collectOperations(runtime.workspaceRoot, artifact, operations, result);
  }

  const finalStates = await planForward(runtime, operations, options, result);
  if (result.unsafeFiles.length > 0 || finalStates.size === 0) return result;

  const journal: FileRewindJournalEntry[] = [];
  try {
    for (const [path, state] of finalStates) {
      throwIfTurnAborted(options.abortSignal);
      const current = await readCurrentFileState.call(
        runtime,
        path,
        options.traceContext,
        options.abortSignal,
      );
      if ("reason" in current) throw new Error(current.message ?? `Failed to journal ${path}`);
      journal.push({ path, state: current });
      if (state.content === null) {
        await runtime.fileSystemPort.removeFile(
          { path, missingOk: true, trace: options.traceContext },
          { signal: options.abortSignal },
        );
        result.changedFiles.push({ action: "delete", path });
        continue;
      }
      await runtime.fileSystemPort.writeTextFile(
        {
          path,
          content: state.content,
          createParents: true,
          atomic: true,
          trace: options.traceContext,
        },
        { signal: options.abortSignal },
      );
      result.changedFiles.push({ action: "write", path });
    }
  } catch (error) {
    // Same all-or-nothing guarantee as the file-summary rewind: undo the partial writes. A
    // failed compensation leaves the workspace mixed, so it escalates instead of reporting.
    try {
      await compensateFileRewindJournal.call(runtime, journal, options.traceContext);
    } catch (compensationError) {
      throw new AggregateError(
        [error, compensationError],
        "Redo failed and compensation was incomplete",
      );
    }
    result.changedFiles = [];
    result.writeFailure = error instanceof Error ? error.message : String(error);
    return result;
  }

  const anchor = checkpoints[0];
  const event = runtime.createEvent(
    SessionEventType.RewindTriggered,
    {
      reason: TURN_REDO_REWIND_REASON,
      restoredSnapshotRef: anchor?.snapshotRef,
      rewindId: `rewind_${crypto.randomUUID()}`,
      scope: RewindScope.Workspace,
      strategy: RewindStrategy.ActiveChain,
      targetCheckpointId: anchor?.checkpointId,
    },
    options.traceContext,
  );
  await runtime.appendEvent(event, options.traceContext);
  result.applied = true;
  return result;
}

async function listTurnCheckpoints(
  runtime: AgentRuntimeInternal,
  turnId: TurnId,
): Promise<CheckpointCreatedPayload[]> {
  const events = await runtime.eventStore.getEvents(runtime.sessionId);
  return events
    .filter(
      (event) =>
        event.type === SessionEventType.CheckpointCreated &&
        String(event.turnId ?? "") === String(turnId),
    )
    .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime())
    .map((event) => parseCheckpointCreatedPayload(event.payload))
    .filter(
      (checkpoint) =>
        checkpoint.scope === RewindScope.Workspace || checkpoint.scope === RewindScope.Both,
    );
}

async function readCheckpointArtifact(
  runtime: AgentRuntimeInternal,
  checkpoint: CheckpointCreatedPayload,
  options: { abortSignal?: AbortSignal; traceContext: TraceContext },
  result: TurnRedoResult,
): Promise<WorkspaceCheckpointArtifact | undefined> {
  try {
    const read = await runtime.artifactStore!.readToolResultArtifact(
      { uri: checkpoint.snapshotRef, trace: options.traceContext },
      { signal: options.abortSignal },
    );
    return parseWorkspaceCheckpointArtifact(JSON.parse(read.content));
  } catch (error) {
    result.unsafeFiles.push({
      message: error instanceof Error ? error.message : String(error),
      path: `checkpoint:${checkpoint.checkpointId}`,
      reason: "checkpoint_unreadable",
    });
    return undefined;
  }
}

function collectOperations(
  workspaceRoot: string,
  artifact: WorkspaceCheckpointArtifact,
  operations: RedoOperation[],
  result: TurnRedoResult,
): void {
  for (const file of artifact.files) {
    const path = resolveCheckpointFilePath(workspaceRoot, file.path);
    if (isIgnoredShellTool(artifact.toolName)) {
      result.ignoredFiles.push(path);
      continue;
    }
    if (!isPathInsideWorkspace(workspaceRoot, path)) {
      result.unsafeFiles.push({
        message: OUTSIDE_WORKSPACE_MESSAGE,
        path,
        reason: "unsupported_checkpoint",
      });
      continue;
    }
    const afterContent = resolveCheckpointAfterContent(file);
    if (afterContent === undefined) {
      result.unsafeFiles.push({ path, reason: "unsupported_checkpoint" });
      continue;
    }
    operations.push({
      afterContent,
      beforeContent: file.existedBefore ? file.beforeContent : null,
      path,
    });
  }
}

/** Simulates the turn forward from the current files; returns each path's final state. */
async function planForward(
  runtime: AgentRuntimeInternal,
  operations: RedoOperation[],
  options: { abortSignal?: AbortSignal; traceContext: TraceContext },
  result: TurnRedoResult,
): Promise<Map<string, PlannedFileState>> {
  const simulated = new Map<string, PlannedFileState>();
  const unsafePaths = new Set(result.unsafeFiles.map((file) => file.path));
  for (const operation of operations) {
    throwIfTurnAborted(options.abortSignal);
    if (unsafePaths.has(operation.path)) continue;
    const current =
      simulated.get(operation.path) ??
      (await readCurrentFileState.call(
        runtime,
        operation.path,
        options.traceContext,
        options.abortSignal,
      ));
    if ("reason" in current) {
      unsafePaths.add(operation.path);
      result.unsafeFiles.push({
        message: current.message,
        path: operation.path,
        reason: current.reason,
      });
      continue;
    }
    if (current.hash !== hashContent(operation.beforeContent)) {
      unsafePaths.add(operation.path);
      result.unsafeFiles.push({ path: operation.path, reason: "external_modified" });
      continue;
    }
    simulated.set(operation.path, {
      content: operation.afterContent,
      exists: operation.afterContent !== null,
      hash: hashContent(operation.afterContent),
    });
  }
  for (const path of unsafePaths) simulated.delete(path);
  return simulated;
}

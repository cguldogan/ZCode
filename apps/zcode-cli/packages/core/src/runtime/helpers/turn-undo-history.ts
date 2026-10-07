// Derives /undo and /redo state from the session event log (specs/tui/diff-review-undo.md §2).
//
// There is deliberately no stored undo stack: the event log (CheckpointCreated +
// RewindTriggered, both persisted and restored on resume) is the single owner, and this pure
// reducer is the only interpretation of it. Undo, redo, and the per-turn desktop "revert files"
// all write the same events, so the three can never disagree.
import {
  RewindScope,
  RewindStrategy,
  SessionEventType,
  parseCheckpointCreatedPayload,
  parseRewindTriggeredPayload,
} from "../deps.js";
import type { SessionEvent, TurnId } from "../deps.js";

/** Same reason the desktop per-turn revert uses, so a desktop revert counts as an undo. */
export const TURN_UNDO_REWIND_REASON = "file_summary_rewind";
export const TURN_REDO_REWIND_REASON = "turn_redo";

const CONTROL_ONLY_EXECUTION_KIND = "controlOnly";
const TURN_INPUT_PREVIEW_MAX_CHARS = 60;

export interface TurnUndoState {
  /** Turns that produced workspace checkpoints, oldest first. */
  changedTurnIds: TurnId[];
  /** Most recent changed turn whose changes are currently applied. */
  undoTargetTurnId?: TurnId;
  /** Most recently undone turn that may still be re-applied (top of the redo stack). */
  redoTargetTurnId?: TurnId;
  undoneTurnIds: TurnId[];
  /** First checkpoint of each changed turn; used as the stable anchor in rewind events. */
  firstCheckpointIdByTurn: ReadonlyMap<TurnId, string>;
  /** Short preview of the prompt that started each turn, when the TurnStarted event is known. */
  inputPreviewByTurn: ReadonlyMap<TurnId, string>;
}

export interface DeriveTurnUndoStateOptions {
  /**
   * Epoch ms of the latest completed model step (`lastAssistantCompletedAtMs`). It survives cold
   * resume, so it invalidates redo even when the TurnStarted of that agent turn is no longer in
   * the in-memory event store.
   */
  lastAgentActivityAtMs?: number;
}

interface RedoEntry {
  turnId: TurnId;
  undoneAtMs: number;
}

export function deriveTurnUndoState(
  events: readonly SessionEvent[],
  options: DeriveTurnUndoStateOptions = {},
): TurnUndoState {
  const checkpointTurn = new Map<string, TurnId>();
  const firstCheckpointIdByTurn = new Map<TurnId, string>();
  const inputPreviewByTurn = new Map<TurnId, string>();
  const changedTurnIds: TurnId[] = [];
  const undone = new Set<TurnId>();
  let redoStack: RedoEntry[] = [];

  // Restored events are appended at resume time in groups (checkpoints, then rewinds); their
  // timestamps are the original ones, so a stable sort by time recovers the true order.
  const ordered = [...events].sort(
    (left, right) => left.timestamp.getTime() - right.timestamp.getTime(),
  );

  for (const event of ordered) {
    if (event.type === SessionEventType.TurnStarted) {
      const payload = event.payload as {
        executionKind?: string;
        input?: unknown;
        messageId?: unknown;
      };
      if (event.turnId && typeof payload.input === "string") {
        inputPreviewByTurn.set(event.turnId, previewInput(payload.input));
      }
      // Only real agent turns record a user message; /undo, /redo, /rewind, /compact do not.
      if (payload.messageId && payload.executionKind !== CONTROL_ONLY_EXECUTION_KIND) {
        redoStack = [];
      }
      continue;
    }

    if (event.type === SessionEventType.CheckpointCreated) {
      const checkpoint = safeParse(() => parseCheckpointCreatedPayload(event.payload));
      if (!checkpoint || !event.turnId || !isWorkspaceScope(checkpoint.scope)) continue;
      checkpointTurn.set(checkpoint.checkpointId, event.turnId);
      if (!firstCheckpointIdByTurn.has(event.turnId)) {
        firstCheckpointIdByTurn.set(event.turnId, checkpoint.checkpointId);
        changedTurnIds.push(event.turnId);
        redoStack = [];
      }
      continue;
    }

    if (event.type === SessionEventType.RewindTriggered) {
      const rewind = safeParse(() => parseRewindTriggeredPayload(event.payload));
      if (!rewind) continue;
      const turnId = rewind.targetCheckpointId
        ? checkpointTurn.get(rewind.targetCheckpointId)
        : undefined;
      const isWorkspace = rewind.scope === RewindScope.Workspace;
      if (isWorkspace && rewind.reason === TURN_UNDO_REWIND_REASON) {
        if (!turnId) continue;
        undone.add(turnId);
        redoStack = redoStack.filter((entry) => entry.turnId !== turnId);
        redoStack.push({ turnId, undoneAtMs: event.timestamp.getTime() });
        continue;
      }
      if (isWorkspace && rewind.reason === TURN_REDO_REWIND_REASON) {
        if (!turnId) continue;
        undone.delete(turnId);
        redoStack = redoStack.filter((entry) => entry.turnId !== turnId);
        continue;
      }
      // Any other applied rewind (/rewind, conversation rewind) changes the baseline that the
      // redo stack was recorded against; dropping it is always safe.
      if (rewind.strategy !== RewindStrategy.Unavailable) {
        redoStack = [];
      }
    }
  }

  const lastActivity = options.lastAgentActivityAtMs;
  if (lastActivity !== undefined && Number.isFinite(lastActivity)) {
    redoStack = redoStack.filter((entry) => entry.undoneAtMs >= lastActivity);
  }

  const undoTargetTurnId = [...changedTurnIds].reverse().find((turnId) => !undone.has(turnId));
  return {
    changedTurnIds,
    firstCheckpointIdByTurn,
    inputPreviewByTurn,
    redoTargetTurnId: redoStack.at(-1)?.turnId,
    undoTargetTurnId,
    undoneTurnIds: changedTurnIds.filter((turnId) => undone.has(turnId)),
  };
}

function isWorkspaceScope(scope: string): boolean {
  return scope === RewindScope.Workspace || scope === RewindScope.Both;
}

function previewInput(input: string): string {
  const singleLine = input.replace(/\s+/g, " ").trim();
  return singleLine.length > TURN_INPUT_PREVIEW_MAX_CHARS
    ? `${singleLine.slice(0, TURN_INPUT_PREVIEW_MAX_CHARS - 1)}…`
    : singleLine;
}

function safeParse<T>(parse: () => T): T | undefined {
  try {
    return parse();
  } catch {
    return undefined;
  }
}

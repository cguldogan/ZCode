// specs/tui/diff-review-undo.md §2 — /undo and /redo against real temp workspaces.
// The runtime is a minimal fake exposing exactly the ports the commands use; files live on disk.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import test from "node:test";
import {
  FileSystemPortError,
  RewindScope,
  RewindStrategy,
  SessionEventType,
  createSessionEvent,
  type SessionEvent,
  type SessionId,
  type TraceContext,
  type TraceId,
  type TurnId,
} from "@zcode/contracts";
import { deriveTurnUndoState } from "../src/runtime/helpers/turn-undo-history.js";
import { executeTurnUndoCommand } from "../src/runtime/methods/turn-undo.js";
import { parseRewindCommand } from "../src/runtime/helpers/commands.js";

const SESSION_ID = "sess_undo_test" as SessionId;

type Edit = { path: string; before: string | null; after: string };

class FakeRuntime {
  readonly sessionId = SESSION_ID;
  readonly rootTraceContext: TraceContext = { traceId: "trace_root" as TraceId };
  readonly events: SessionEvent[] = [];
  readonly artifacts = new Map<string, string>();
  readonly notices: string[] = [];
  lastAssistantCompletedAtMs?: number;
  private clock = 1_000_000;

  constructor(readonly workspaceRoot: string) {}

  readonly eventStore = {
    getEvents: async () => [...this.events],
  };

  readonly artifactStore = {
    readToolResultArtifact: async ({ uri }: { uri: string }) => {
      const content = this.artifacts.get(uri);
      if (content === undefined) throw new Error(`missing artifact ${uri}`);
      return { content };
    },
  };

  readonly fileSystemPort = {
    readTextFile: async ({ path }: { path: string }) => {
      try {
        return { content: await readFile(path, "utf8") };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          throw new FileSystemPortError({ code: "not_found", message: "not found", path });
        }
        throw error;
      }
    },
    writeTextFile: async ({ path, content }: { path: string; content: string }) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf8");
      return {};
    },
    removeFile: async ({ path }: { path: string }) => {
      await rm(path, { force: true });
      return {};
    },
  };

  readonly messageHistory = {
    addAttachment: (_source: string, content: string) => {
      this.notices.push(content);
    },
  };

  async persistSyntheticUserNotice(): Promise<void> {}

  now(): number {
    this.clock += 10;
    return this.clock;
  }

  createEvent(type: SessionEventType, payload: unknown, trace: TraceContext): SessionEvent {
    const event = createSessionEvent(type, this.sessionId, payload, {
      traceId: trace.traceId,
      turnId: trace.turnId,
    });
    event.timestamp = new Date(this.now());
    return event;
  }

  async appendEvent(event: SessionEvent): Promise<void> {
    this.events.push(event);
  }

  /** Simulates an agent turn that edited files through checkpointed tools. */
  async agentTurn(turnId: string, input: string, edits: Edit[], toolName = "Edit"): Promise<void> {
    const trace = { traceId: "trace_turn" as TraceId, turnId: turnId as TurnId };
    await this.appendEvent(
      this.createEvent(
        SessionEventType.TurnStarted,
        { input, messageId: `msg_${turnId}`, turnNumber: 1 },
        trace,
      ),
    );
    for (const [index, edit] of edits.entries()) {
      const absolute = isAbsolute(edit.path) ? edit.path : join(this.workspaceRoot, edit.path);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, edit.after, "utf8");
      const uri = `artifact://${turnId}/${index}`;
      this.artifacts.set(
        uri,
        JSON.stringify({
          createdAt: new Date().toISOString(),
          files: [
            {
              afterContent: edit.after,
              beforeContent: edit.before,
              existedBefore: edit.before !== null,
              path: edit.path,
              structuredPatch: [],
            },
          ],
          kind: "workspace_file_before_change",
          toolCallId: `call_${turnId}_${index}`,
          toolName,
          version: 1,
        }),
      );
      await this.appendEvent(
        this.createEvent(
          SessionEventType.CheckpointCreated,
          {
            checkpointId: `checkpoint_${turnId}_${index}`,
            fileCount: 1,
            messageId: `msg_assistant_${turnId}`,
            scope: RewindScope.Workspace,
            snapshotRef: uri,
          },
          trace,
        ),
      );
    }
    this.lastAssistantCompletedAtMs = this.now();
  }

  async run(action: "undo" | "redo", args = ""): Promise<string> {
    return await executeTurnUndoCommand(
      this as never,
      { action, args },
      {
        traceContext: {
          traceId: "trace_cmd" as TraceId,
          turnId: `turn_cmd_${this.now()}` as TurnId,
        },
      },
    );
  }

  read(path: string): Promise<string> {
    return readFile(join(this.workspaceRoot, path), "utf8");
  }
}

async function withWorkspace(run: (runtime: FakeRuntime) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "zcode-undo-"));
  try {
    await run(new FakeRuntime(root));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

test("parseRewindCommand recognizes /undo and /redo", () => {
  assert.deepEqual(parseRewindCommand("/undo"), { action: "undo", args: "" });
  assert.deepEqual(parseRewindCommand("  /redo  "), { action: "redo", args: "" });
  assert.deepEqual(parseRewindCommand("/undo 2"), { action: "undo", args: "2" });
  assert.equal(parseRewindCommand("/undone"), null);
  assert.equal(parseRewindCommand("please /undo"), null);
});

test("nothing to undo or redo in a session without file changes", async () => {
  await withWorkspace(async (runtime) => {
    assert.match(await runtime.run("undo"), /Nothing to undo: no agent turn has changed files/);
    assert.match(await runtime.run("redo"), /Nothing to redo: no undone agent turn/);
    assert.equal(runtime.events.length, 0);
  });
});

test("arguments are rejected with usage", async () => {
  await withWorkspace(async (runtime) => {
    assert.equal(await runtime.run("undo", "all"), "Usage: /undo");
  });
});

test("undo restores edited files and deletes created files; redo re-applies them", async () => {
  await withWorkspace(async (runtime) => {
    await writeFile(join(runtime.workspaceRoot, "a.txt"), "one\n");
    await runtime.agentTurn("turn_1", "refactor a", [
      { path: "a.txt", before: "one\n", after: "two\n" },
      { path: "src/b.txt", before: null, after: "new file\n" },
    ]);

    const undo = await runtime.run("undo");
    assert.match(undo, /Undid 2 files from the agent turn "refactor a"/);
    assert.equal(await runtime.read("a.txt"), "one\n");
    assert.equal(await exists(join(runtime.workspaceRoot, "src/b.txt")), false);
    assert.equal(runtime.notices.length, 1);
    assert.match(runtime.notices[0]!, /ran \/undo/);

    const redo = await runtime.run("redo");
    assert.match(redo, /Redid 2 files/);
    assert.equal(await runtime.read("a.txt"), "two\n");
    assert.equal(await runtime.read("src/b.txt"), "new file\n");
    const reasons = runtime.events
      .filter((event) => event.type === SessionEventType.RewindTriggered)
      .map((event) => (event.payload as { reason?: string }).reason);
    assert.deepEqual(reasons, ["file_summary_rewind", "turn_redo"]);

    // After redo the turn is applied again, so it is the undo target once more.
    assert.match(await runtime.run("undo"), /Undid 2 files/);
    assert.equal(await runtime.read("a.txt"), "one\n");
  });
});

test("multiple edits of one file in a turn undo to the original content", async () => {
  await withWorkspace(async (runtime) => {
    await writeFile(join(runtime.workspaceRoot, "a.txt"), "v1");
    await runtime.agentTurn("turn_1", "edit twice", [
      { path: "a.txt", before: "v1", after: "v2" },
      { path: "a.txt", before: "v2", after: "v3" },
    ]);
    assert.match(await runtime.run("undo"), /Undid 1 file /);
    assert.equal(await runtime.read("a.txt"), "v1");
    assert.match(await runtime.run("redo"), /Redid 1 file /);
    assert.equal(await runtime.read("a.txt"), "v3");
  });
});

test("undo refuses and writes nothing when the user edited a file after the turn", async () => {
  await withWorkspace(async (runtime) => {
    await writeFile(join(runtime.workspaceRoot, "a.txt"), "one");
    await writeFile(join(runtime.workspaceRoot, "c.txt"), "c1");
    await runtime.agentTurn("turn_1", "edit", [
      { path: "a.txt", before: "one", after: "two" },
      { path: "c.txt", before: "c1", after: "c2" },
    ]);
    await writeFile(join(runtime.workspaceRoot, "a.txt"), "user edit");

    const response = await runtime.run("undo");
    assert.match(response, /Undo refused; no files were changed/);
    assert.match(response, /a\.txt \(changed since the agent turn\)/);
    assert.equal(await runtime.read("a.txt"), "user edit");
    assert.equal(await runtime.read("c.txt"), "c2", "the safe file must not be reverted either");
    assert.equal(
      runtime.events.some((event) => event.type === SessionEventType.RewindTriggered),
      false,
    );
  });
});

test("redo refuses when the user edited a file after the undo", async () => {
  await withWorkspace(async (runtime) => {
    await writeFile(join(runtime.workspaceRoot, "a.txt"), "one");
    await runtime.agentTurn("turn_1", "edit", [{ path: "a.txt", before: "one", after: "two" }]);
    await runtime.run("undo");
    await writeFile(join(runtime.workspaceRoot, "a.txt"), "user edit");
    assert.match(await runtime.run("redo"), /Redo refused; no files were changed/);
    assert.equal(await runtime.read("a.txt"), "user edit");
  });
});

test("repeated undo walks back turns; redo is LIFO", async () => {
  await withWorkspace(async (runtime) => {
    await runtime.agentTurn("turn_1", "first", [{ path: "a.txt", before: null, after: "a" }]);
    await runtime.agentTurn("turn_2", "second", [{ path: "b.txt", before: null, after: "b" }]);

    assert.match(await runtime.run("undo"), /"second"/);
    assert.match(await runtime.run("undo"), /"first"/);
    assert.match(await runtime.run("undo"), /already undone/);
    assert.match(await runtime.run("redo"), /"first"/);
    assert.equal(await runtime.read("a.txt"), "a");
    assert.equal(await exists(join(runtime.workspaceRoot, "b.txt")), false);
    assert.match(await runtime.run("redo"), /"second"/);
    assert.match(await runtime.run("redo"), /Nothing to redo/);
  });
});

test("a new agent turn after undo invalidates redo", async () => {
  await withWorkspace(async (runtime) => {
    await runtime.agentTurn("turn_1", "first", [{ path: "a.txt", before: null, after: "a" }]);
    await runtime.run("undo");
    // A conversational turn without file changes still invalidates redo.
    await runtime.agentTurn("turn_2", "just a question", []);
    assert.match(await runtime.run("redo"), /agent has run since the last \/undo/);
    assert.equal(await exists(join(runtime.workspaceRoot, "a.txt")), false);
  });
});

test("model activity recorded after a cold resume also invalidates redo", async () => {
  await withWorkspace(async (runtime) => {
    await runtime.agentTurn("turn_1", "first", [{ path: "a.txt", before: null, after: "a" }]);
    await runtime.run("undo");
    // Resume drops TurnStarted events but restores lastAssistantCompletedAtMs from the store.
    const resumed = runtime.events.filter((event) => event.type !== SessionEventType.TurnStarted);
    runtime.events.splice(0, runtime.events.length, ...resumed);
    runtime.lastAssistantCompletedAtMs = runtime.now();
    assert.match(await runtime.run("redo"), /agent has run since/);
  });
});

test("undo refuses files outside the workspace", async () => {
  await withWorkspace(async (runtime) => {
    const outside = await mkdtemp(join(tmpdir(), "zcode-undo-outside-"));
    try {
      const target = join(outside, "x.txt");
      await runtime.agentTurn("turn_1", "edit outside", [
        { path: target, before: "o", after: "n" },
      ]);
      const response = await runtime.run("undo");
      assert.match(response, /Undo refused/);
      assert.match(response, /outside the workspace/);
      assert.equal(await readFile(target, "utf8"), "n");
    } finally {
      await rm(outside, { force: true, recursive: true });
    }
  });
});

test("shell-tool checkpoints are not undoable", async () => {
  await withWorkspace(async (runtime) => {
    await runtime.agentTurn(
      "turn_1",
      "shell",
      [{ path: "a.txt", before: null, after: "a" }],
      "Bash",
    );
    assert.match(await runtime.run("undo"), /made by shell commands/);
    assert.equal(await runtime.read("a.txt"), "a");
  });
});

test("deriveTurnUndoState: other applied rewinds clear the redo stack; order follows timestamps", () => {
  const trace = { traceId: "t" as TraceId };
  const at = (ms: number, event: SessionEvent): SessionEvent => {
    event.timestamp = new Date(ms);
    return event;
  };
  const checkpoint = (ms: number, turn: string) =>
    at(
      ms,
      createSessionEvent(
        SessionEventType.CheckpointCreated,
        SESSION_ID,
        {
          checkpointId: `cp_${turn}`,
          messageId: "m",
          scope: RewindScope.Workspace,
          snapshotRef: "s",
        },
        { ...trace, turnId: turn as TurnId },
      ),
    );
  const rewind = (
    ms: number,
    reason: string,
    checkpointId?: string,
    strategy: string = RewindStrategy.ActiveChain,
  ) =>
    at(
      ms,
      createSessionEvent(SessionEventType.RewindTriggered, SESSION_ID, {
        reason,
        rewindId: `r_${ms}`,
        scope: RewindScope.Workspace,
        strategy,
        ...(checkpointId ? { targetCheckpointId: checkpointId } : {}),
      }),
    );

  // Restored events arrive grouped (rewinds after checkpoints) but carry original timestamps.
  const events = [
    checkpoint(10, "t1"),
    checkpoint(30, "t2"),
    rewind(20, "file_summary_rewind", "cp_t1"),
  ];
  const state = deriveTurnUndoState(events);
  assert.equal(state.undoTargetTurnId, "t2");
  // t2 created checkpoints after t1 was undone, so redo of t1 is no longer offered.
  assert.equal(state.redoTargetTurnId, undefined);

  const withRedo = deriveTurnUndoState([
    checkpoint(10, "t1"),
    rewind(20, "file_summary_rewind", "cp_t1"),
  ]);
  assert.equal(withRedo.redoTargetTurnId, "t1");
  assert.equal(withRedo.undoTargetTurnId, undefined);

  const afterRewind = deriveTurnUndoState([
    checkpoint(10, "t1"),
    rewind(20, "file_summary_rewind", "cp_t1"),
    rewind(30, "target_in_active_chain"),
  ]);
  assert.equal(afterRewind.redoTargetTurnId, undefined);

  const unavailableRewind = deriveTurnUndoState([
    checkpoint(10, "t1"),
    rewind(20, "file_summary_rewind", "cp_t1"),
    rewind(30, "no_checkpoint_available", undefined, RewindStrategy.Unavailable),
  ]);
  assert.equal(unavailableRewind.redoTargetTurnId, "t1");
});

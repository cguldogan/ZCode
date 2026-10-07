// specs/tui/diff-review-undo.md — slash command registration and routing for /review, /undo, /redo.
import assert from "node:assert/strict";
import test from "node:test";
import { createCommandCenter } from "../src/command-center/create.js";
import { refuseTurnUndoWhileBusy } from "../src/command-center/handlers/review-undo.js";
import { formatSlashCommandHelp, parseSlashCommand } from "../src/command-center/slash-commands.js";

test("review, undo and redo parse as known commands", () => {
  assert.deepEqual(parseSlashCommand("/review"), {
    args: "",
    name: "review",
    rawName: "review",
    type: "known",
  });
  assert.deepEqual(parseSlashCommand("/UNDO"), {
    args: "",
    name: "undo",
    rawName: "undo",
    type: "known",
  });
  assert.deepEqual(parseSlashCommand("/redo now"), {
    args: "now",
    name: "redo",
    rawName: "redo",
    type: "known",
  });
});

test("/help lists the new commands", () => {
  const help = formatSlashCommandHelp();
  assert.match(help, /- \/review: /);
  assert.match(help, /- \/undo: /);
  assert.match(help, /- \/redo: /);
  assert.match(formatSlashCommandHelp("undo"), /Refuses without writing anything/);
});

function commandCenterWithApp(submitted: string[]) {
  return createCommandCenter({
    getApp: async () =>
      ({
        sessionId: "sess_test",
        submitPrompt: async (prompt: unknown) => {
          submitted.push(String(prompt));
          return { response: "runtime response" };
        },
        traceId: "trace_test",
      }) as never,
    getMode: () => "build",
    resumeApp: async () => {
      throw new Error("must not resume");
    },
  });
}

test("/undo and /redo are forwarded verbatim to the session runtime", async () => {
  const submitted: string[] = [];
  const center = commandCenterWithApp(submitted);
  const options = { abortSignal: new AbortController().signal };
  assert.equal((await center("/undo", options)).response, "runtime response");
  assert.equal((await center("/redo", options)).response, "runtime response");
  assert.deepEqual(submitted, ["/undo", "/redo"]);
  assert.equal((await center("/undo 3", options)).response, "Usage: /undo");
  assert.deepEqual(submitted, ["/undo", "/redo"]);
});

test("/review in the command center never starts a turn", async () => {
  const submitted: string[] = [];
  const center = commandCenterWithApp(submitted);
  const options = { abortSignal: new AbortController().signal };
  assert.match((await center("/review", options)).response, /interactive view in the TUI/);
  assert.equal((await center("/review all", options)).response, "Usage: /review");
  assert.deepEqual(submitted, []);
});

test("/undo and /redo are refused while a turn is running", () => {
  assert.match(
    refuseTurnUndoWhileBusy(parseSlashCommand("/undo"))?.response ?? "",
    /unavailable while the agent is working/,
  );
  assert.equal(refuseTurnUndoWhileBusy(parseSlashCommand("/model")), undefined);
  assert.equal(refuseTurnUndoWhileBusy(parseSlashCommand("hello")), undefined);
});

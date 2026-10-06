import assert from "node:assert/strict";
import test from "node:test";
import { SessionEventType } from "@zcode/contracts";
import { inputStatusLocation } from "../src/app-input-status.js";
import { isExitCommand } from "../src/app-submit-controller.js";
import {
  completeModelThroughput,
  createModelThroughputTracker,
  formatTokensPerSecond,
  markModelRequestStarted,
  markModelStreaming,
  trackModelThroughputEvent,
  type ModelThroughput,
} from "../src/app-throughput.js";

test("throughput is measured from the first streamed delta, excluding time to first token", () => {
  const tracker = createModelThroughputTracker();
  markModelRequestStarted(tracker, 0);
  markModelStreaming(tracker, 3_000);
  markModelStreaming(tracker, 3_500);
  const throughput = completeModelThroughput(tracker, 100, 5_000);
  assert.equal(throughput?.durationMs, 2_000);
  assert.equal(throughput?.tokensPerSecond, 50);
});

test("very short stream windows fall back to the request start", () => {
  const tracker = createModelThroughputTracker();
  markModelRequestStarted(tracker, 0);
  markModelStreaming(tracker, 900);
  assert.equal(completeModelThroughput(tracker, 10, 1_000)?.tokensPerSecond, 10);
});

test("no output tokens or no timing yields no throughput, and completion resets the tracker", () => {
  const tracker = createModelThroughputTracker();
  markModelRequestStarted(tracker, 0);
  assert.equal(completeModelThroughput(tracker, 0, 1_000), undefined);
  assert.equal(completeModelThroughput(tracker, 50, 2_000), undefined);
});

test("session events drive the tracker and report usage output tokens", () => {
  const reported: ModelThroughput[] = [];
  const handlers = {
    setThroughput: (value: ModelThroughput) => reported.push(value),
    throughputTracker: createModelThroughputTracker(),
  };
  trackModelThroughputEvent(SessionEventType.ModelRequest, {}, handlers, 0);
  trackModelThroughputEvent(SessionEventType.ModelStreaming, {}, handlers, 1_000);
  trackModelThroughputEvent(
    SessionEventType.ModelComplete,
    { usage: { outputTokens: 80, inputTokens: 10, totalTokens: 90 } },
    handlers,
    3_000,
  );
  assert.equal(reported.length, 1);
  assert.equal(reported[0]?.tokensPerSecond, 40);
});

test("tokens per second formatting", () => {
  const at = (tokensPerSecond: number) => ({ durationMs: 1, outputTokens: 1, tokensPerSecond });
  assert.equal(formatTokensPerSecond(at(42.345)), "42.3 tok/s");
  assert.equal(formatTokensPerSecond(at(123.6)), "124 tok/s");
  assert.equal(formatTokensPerSecond(undefined), undefined);
});

test("status location abbreviates the home directory and appends the git branch", () => {
  assert.equal(inputStatusLocation("/home/me/src/app", "main", "/home/me"), "~/src/app ⎇ main");
  assert.equal(inputStatusLocation("/home/me", undefined, "/home/me"), "~");
  assert.equal(inputStatusLocation("/home/meta/x", undefined, "/home/me"), "/home/meta/x");
  assert.equal(inputStatusLocation(undefined, undefined, "/home/me"), undefined);
});

test("exit commands", () => {
  assert.equal(isExitCommand("/exit"), true);
  assert.equal(isExitCommand(" /QUIT "), true);
  assert.equal(isExitCommand("/exit now"), false);
  assert.equal(isExitCommand("exit"), false);
});

test("main-turn model completion replaces the 200K placeholder context window", async () => {
  const { initialSessionProjection, apply } = await import("@zcode/contracts");
  const event = {
    payload: {
      content: "ok",
      contextWindow: 1_000_000,
      querySource: "main_turn",
      stopReason: "stop",
      usage: { inputTokens: 1_000, outputTokens: 10, totalTokens: 1_010 },
    },
    sessionId: "s",
    timestamp: new Date(),
    type: SessionEventType.ModelComplete,
  };
  const projection = apply({ ...initialSessionProjection } as never, event as never);
  assert.equal(projection.contextWindow, 1_000_000);
});

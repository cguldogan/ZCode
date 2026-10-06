import { SessionEventType } from "@zcode/contracts";
import React from "react";
import { usageFromPayload } from "./app-event-data.js";

/** Output speed of the most recent completed model request. */
export type ModelThroughput = {
  durationMs: number;
  outputTokens: number;
  tokensPerSecond: number;
};

/** Mutable per-request timing, owned by the app and updated from session events. */
export type ModelThroughputTracker = {
  firstStreamAtMs?: number;
  requestStartedAtMs?: number;
};

// Below this, a streaming window mostly measures event batching, not generation; fall back to the
// request start so very short replies do not report absurd speeds.
const MIN_STREAM_WINDOW_MS = 250;

export function createModelThroughputTracker(): ModelThroughputTracker {
  return {};
}

export function markModelRequestStarted(tracker: ModelThroughputTracker, nowMs: number): void {
  tracker.requestStartedAtMs = nowMs;
  tracker.firstStreamAtMs = undefined;
}

export function markModelStreaming(tracker: ModelThroughputTracker, nowMs: number): void {
  tracker.firstStreamAtMs ??= nowMs;
}

/**
 * Measures generation speed from the first streamed delta, so prompt processing (time to first
 * token) does not drag the number down. Returns undefined when there is nothing to measure.
 */
export function completeModelThroughput(
  tracker: ModelThroughputTracker,
  outputTokens: number,
  nowMs: number,
): ModelThroughput | undefined {
  const { firstStreamAtMs, requestStartedAtMs } = tracker;
  tracker.firstStreamAtMs = undefined;
  tracker.requestStartedAtMs = undefined;
  if (!Number.isFinite(outputTokens) || outputTokens <= 0) return undefined;

  const streamWindowMs = firstStreamAtMs === undefined ? undefined : nowMs - firstStreamAtMs;
  const durationMs =
    streamWindowMs !== undefined && streamWindowMs >= MIN_STREAM_WINDOW_MS
      ? streamWindowMs
      : requestStartedAtMs === undefined
        ? undefined
        : nowMs - requestStartedAtMs;
  if (durationMs === undefined || durationMs <= 0) return undefined;

  return {
    durationMs,
    outputTokens,
    tokensPerSecond: outputTokens / (durationMs / 1000),
  };
}

export function formatTokensPerSecond(throughput: ModelThroughput | undefined): string | undefined {
  if (!throughput || !Number.isFinite(throughput.tokensPerSecond)) return undefined;
  const value = throughput.tokensPerSecond;
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} tok/s`;
}

export type ModelThroughputHandlers = {
  setThroughput: (throughput: ModelThroughput) => void;
  throughputTracker: ModelThroughputTracker;
};

/** Feeds model request lifecycle events into the tracker; ignores every other event type. */
export function trackModelThroughputEvent(
  eventType: string,
  payload: Record<string, unknown>,
  handlers: Partial<ModelThroughputHandlers>,
  nowMs = Date.now(),
): void {
  const { setThroughput, throughputTracker: tracker } = handlers;
  if (!tracker || !setThroughput) return;
  if (eventType === SessionEventType.ModelRequest) {
    markModelRequestStarted(tracker, nowMs);
  } else if (eventType === SessionEventType.ModelStreaming) {
    markModelStreaming(tracker, nowMs);
  } else if (eventType === SessionEventType.ModelComplete) {
    const outputTokens = usageFromPayload(payload)?.outputTokens ?? 0;
    const throughput = completeModelThroughput(tracker, outputTokens, nowMs);
    if (throughput) setThroughput(throughput);
  }
}

/** Last completed request's output speed plus the handlers that keep it current. */
export function useModelThroughput(): {
  handlers: ModelThroughputHandlers;
  throughput: ModelThroughput | undefined;
} {
  const [throughput, setThroughput] = React.useState<ModelThroughput | undefined>();
  const trackerRef = React.useRef(createModelThroughputTracker());
  const handlers = React.useMemo(
    () => ({ setThroughput, throughputTracker: trackerRef.current }),
    [],
  );
  return { handlers, throughput };
}

// specs/tui/mcp-manager.md — row view-model, key reducer and sidebar summary.
import assert from "node:assert/strict";
import test from "node:test";
import type { McpServerStatus } from "@zcode/contracts";
import { getZCodeCopy } from "@zcode/i18n";
import { buildMcpLines, windowMcpLines } from "../src/app-mcp-lines.js";
import { mcpNoticeText } from "../src/app-mcp-notice.js";
import {
  applyMcpActionResult,
  applyMcpListing,
  mcpDisplayStatus,
  openMcpPanel,
  reduceMcpKey,
  shortMcpError,
  summarizeMcpStatuses,
  type McpPanelState,
} from "../src/app-mcp-state.js";
import type { ReviewKey } from "../src/app-review-state.js";
import { isMcpCommand } from "../src/app-submit-controller.js";
import { displayWidth } from "../src/app-terminal-width.js";
import type { TuiMcpServerEntry } from "../src/mcp-manager-types.js";

const copy = getZCodeCopy("en-US").tui;

function entry(
  name: string,
  status: Partial<McpServerStatus> = {},
  extra: Partial<TuiMcpServerEntry> = {},
): TuiMcpServerEntry {
  return {
    name,
    origin: "user",
    status: { status: "connected", toolCount: 2, transport: "stdio", updatedAt: "t", ...status },
    toggleable: true,
    toolNames: ["alpha", "beta"],
    ...extra,
  };
}

function loaded(entries: TuiMcpServerEntry[]): McpPanelState {
  const opened = openMcpPanel();
  assert.deepEqual(opened.effect, { requestId: 1, type: "load" });
  return applyMcpListing(opened.state, 1, entries);
}

function press(state: McpPanelState, ...keys: Array<string | ReviewKey>) {
  let current = state;
  let last: ReturnType<typeof reduceMcpKey> | undefined;
  for (const key of keys) {
    last = reduceMcpKey(current, typeof key === "string" ? { name: key } : key);
    current = last.state;
  }
  return last!;
}

const three = () => [entry("a"), entry("b", { status: "disabled", toolCount: 0 }), entry("c")];

test("display status marks a pending OAuth connection as needs_auth", () => {
  const base = entry("x").status;
  assert.equal(mcpDisplayStatus({ ...base, status: "connecting" }), "connecting");
  assert.equal(
    mcpDisplayStatus({
      ...base,
      authorization: { authorizationUrl: "u", startedAt: "t", type: "oauth_authorization_code" },
      status: "connecting",
    }),
    "needs_auth",
  );
});

test("summary counts disabled servers separately from the expected-connected total", () => {
  const statuses = three().map((e) => e.status);
  assert.deepEqual(summarizeMcpStatuses(statuses), { connected: 2, disabled: 1, enabled: 2 });
});

test("errors are flattened to one line and truncated to the width", () => {
  assert.equal(shortMcpError(undefined, 20), undefined);
  assert.equal(shortMcpError("  \n ", 20), undefined);
  const short = shortMcpError("spawn failed\n  at foo\n   at bar and a very long tail", 18)!;
  assert.equal(short.includes("\n"), false);
  assert.ok(displayWidth(short) <= 18);
});

test("navigation clamps, wraps nothing, and Esc/q close", () => {
  const state = loaded(three());
  assert.equal(press(state, "down", "down", "down").state.selectedIndex, 2);
  assert.equal(press(state, "up").state.selectedIndex, 0);
  assert.equal(press(state, { name: "g", shift: true }).state.selectedIndex, 2);
  assert.deepEqual(press(state, "escape").effect, { type: "close" });
  assert.deepEqual(press(state, "q").effect, { type: "close" });
});

test("Space toggles: enabled server -> disable, disabled server -> enable, marks pending", () => {
  const first = press(loaded(three()), "space");
  assert.deepEqual(first.effect, { enabled: false, name: "a", type: "setEnabled" });
  assert.deepEqual(first.state.pending, ["a"]);
  // Further actions on the same server are ignored while in flight.
  assert.equal(press(first.state, "space").effect, undefined);
  assert.equal(press(first.state, "r").effect, undefined);

  const second = press(loaded(three()), "down", "return");
  assert.deepEqual(second.effect, { enabled: true, name: "b", type: "setEnabled" });
});

test("a non-toggleable server only shows the read-only notice", () => {
  const state = loaded([entry("node_repl", {}, { origin: "builtin", toggleable: false })]);
  const result = press(state, "space");
  assert.equal(result.effect, undefined);
  assert.equal(result.state.notice?.kind, "readOnly");
  assert.deepEqual(result.state.pending, []);
});

test("reconnect is gated on the server being enabled", () => {
  const state = loaded(three());
  assert.deepEqual(press(state, "r").effect, { name: "a", type: "reconnect" });
  const onDisabled = press(state, "down", "r");
  assert.equal(onDisabled.effect, undefined);
  assert.deepEqual(onDisabled.state.notice, { kind: "needsEnabled", name: "b" });
});

test("t / right expand and left collapse the selected server's tools", () => {
  const state = loaded(three());
  assert.deepEqual(press(state, "t").state.expanded, ["a"]);
  assert.deepEqual(press(state, "t", "t").state.expanded, []);
  assert.deepEqual(press(state, "right").state.expanded, ["a"]);
  assert.deepEqual(press(state, "right", "left").state.expanded, []);
});

test("R reloads and a stale listing result is dropped", () => {
  const state = loaded(three());
  const reload = press(state, { name: "r", shift: true });
  assert.deepEqual(reload.effect, { requestId: 2, type: "load" });
  assert.equal(applyMcpListing(reload.state, 1, [entry("zzz")]), reload.state);
  const fresh = applyMcpListing(reload.state, 2, [entry("only")]);
  assert.equal(fresh.entries?.length, 1);
  assert.equal(fresh.selectedIndex, 0);
  assert.equal(applyMcpListing(reload.state, 2, undefined).loadFailed, true);
});

test("an action result replaces the row, clears pending and reports the outcome", () => {
  const started = press(loaded(three()), "space").state;
  const off = entry("a", { status: "disabled", toolCount: 0 }, { toolNames: [] });
  const done = applyMcpActionResult(started, "a", "setEnabled", { entry: off, ok: true });
  assert.equal(done.entries?.[0]?.status.status, "disabled");
  assert.deepEqual(done.pending, []);
  assert.deepEqual(done.notice, { kind: "done", name: "a", outcome: "disabled" });

  const failed = applyMcpActionResult(started, "a", "setEnabled", {
    code: "persist_failed",
    message: "disk full",
    ok: false,
  });
  assert.deepEqual(failed.notice, { kind: "failed", message: "disk full", name: "a" });
  assert.equal(failed.entries?.[0]?.status.status, "connected");
});

test("modified keys are not consumed so Ctrl+C still reaches the app", () => {
  assert.equal(reduceMcpKey(loaded(three()), { ctrl: true, name: "c" }).consumed, false);
});

test("rows show status, name, transport, origin and tool count; disabled rows are dimmed", () => {
  const state = { ...loaded(three()), selectedIndex: 0 };
  const lines = buildMcpLines({ copy, entries: state.entries!, state, width: 80 });
  const rows = lines.filter((line) => line.key.startsWith("row:"));
  assert.match(rows[0]!.text, /^> connected\s+a\s+stdio user 2 tools$/);
  assert.equal(rows[0]!.tone, "success");
  assert.match(rows[1]!.text, /disabled\s+b\s+stdio user 0 tools/);
  assert.equal(rows[1]!.tone, "muted");
});

test("failed servers always show their error; compact width drops the origin column", () => {
  const failed = entry("bad", { error: "ENOENT: no such file\nstack...", status: "failed" });
  const state = { ...loaded([entry("ok"), failed]), selectedIndex: 0 };
  const wide = buildMcpLines({ copy, entries: state.entries!, state, width: 80 });
  const detail = wide.find((line) => line.key === "detail:bad")!;
  assert.equal(detail.tone, "danger");
  assert.match(detail.text, /ENOENT: no such file stack/);

  const narrow = buildMcpLines({ copy, entries: state.entries!, state, width: 40 });
  for (const line of narrow) assert.ok(displayWidth(line.text) <= 40, line.text);
  assert.doesNotMatch(narrow.find((line) => line.key === "row:ok")!.text, /user/);
});

test("expanded tools list names, and long lists are capped", () => {
  const tools = Array.from({ length: 20 }, (_, i) => `tool${i}`);
  const big = entry("big", { toolCount: 20 }, { toolNames: tools });
  const state = { ...loaded([big]), expanded: ["big"] };
  const lines = buildMcpLines({ copy, entries: [big], state, width: 80 });
  assert.ok(lines.some((line) => line.text.includes("tool0")));
  assert.ok(!lines.some((line) => line.text.includes("tool19")));
  assert.ok(lines.some((line) => line.text.includes("+8 more")));
});

test("windowing keeps the selected server's lines visible", () => {
  const entries = Array.from({ length: 10 }, (_, i) => entry(`s${i}`));
  const state = { ...loaded(entries), selectedIndex: 9 };
  const lines = buildMcpLines({ copy, entries, state, width: 80 });
  const windowed = windowMcpLines(lines, 9, 4);
  assert.equal(windowed.length, 4);
  assert.ok(windowed.some((line) => line.entryIndex === 9));
});

test("notices name the owning plugin for read-only servers", () => {
  const builtin = entry("node_repl", {}, { origin: "builtin", ownerPluginIds: ["browser-use@x"] });
  const text = mcpNoticeText(copy, { entry: builtin, kind: "readOnly" });
  assert.match(text, /browser-use@x/);
  assert.match(text, /\/plugins disable/);
});

test("only a bare /mcp opens the manager", () => {
  assert.equal(isMcpCommand("/mcp"), true);
  assert.equal(isMcpCommand("  /MCP "), true);
  assert.equal(isMcpCommand("/mcp list"), false);
  assert.equal(isMcpCommand("/mcpx"), false);
});

// Transient /mcp manager state (specs/tui/mcp-manager.md). Pure: keys and results in, next state
// and at most one effect out. The hook in app-mcp-panel.ts executes effects against the injected
// TuiMcpManager; nothing here touches config, the runtime or the renderer.
import type { McpServerStatus } from "@zcode/contracts";
import { keyChar, type ReviewKey } from "./app-review-state.js";
import { clampIndex } from "./app-selection-keyboard.js";
import { truncateDisplay } from "./app-terminal-width.js";
import type { TuiMcpActionResult, TuiMcpServerEntry } from "./mcp-manager-types.js";

export const MCP_PAGE_SIZE = 8;

/** Display status: the runtime status plus "needs_auth" for a connection waiting on OAuth. */
export type McpDisplayStatus = McpServerStatus["status"] | "needs_auth";

export type McpNotice =
  | { kind: "done"; name: string; outcome: "disabled" | "enabled" | "reconnected" }
  | { kind: "failed"; message: string; name: string }
  | { entry: TuiMcpServerEntry; kind: "readOnly" }
  | { kind: "needsEnabled"; name: string };

export type McpPanelState = {
  /** `undefined` while the first listing is loading. */
  entries?: readonly TuiMcpServerEntry[];
  expanded: readonly string[];
  loadFailed: boolean;
  notice?: McpNotice;
  /** Servers with an in-flight toggle/reconnect; further actions on them are ignored. */
  pending: readonly string[];
  /** Monotonic listing generation; older results are dropped. */
  requestId: number;
  selectedIndex: number;
};

export type McpEffect =
  | { type: "close" }
  | { requestId: number; type: "load" }
  | { enabled: boolean; name: string; type: "setEnabled" }
  | { name: string; type: "reconnect" };

export type McpKeyResult = { consumed: boolean; effect?: McpEffect; state: McpPanelState };

export function openMcpPanel(previous?: McpPanelState): { effect: McpEffect; state: McpPanelState } {
  const requestId = (previous?.requestId ?? 0) + 1;
  return {
    effect: { requestId, type: "load" },
    state: { expanded: [], loadFailed: false, pending: [], requestId, selectedIndex: 0 },
  };
}

export function mcpDisplayStatus(status: McpServerStatus): McpDisplayStatus {
  return status.status === "connecting" && status.authorization ? "needs_auth" : status.status;
}

export function isMcpDisabled(entry: TuiMcpServerEntry): boolean {
  return entry.status.status === "disabled";
}

/** Counts shown in the sidebar and the panel header; disabled servers are not "expected" up. */
export function summarizeMcpStatuses(statuses: readonly McpServerStatus[]): {
  connected: number;
  disabled: number;
  enabled: number;
} {
  const disabled = statuses.filter((status) => status.status === "disabled").length;
  return {
    connected: statuses.filter((status) => status.status === "connected").length,
    disabled,
    enabled: statuses.length - disabled,
  };
}

/** One-line error text for a row; whitespace is collapsed so multi-line stderr stays on a line. */
export function shortMcpError(error: string | undefined, width: number): string | undefined {
  const flat = error?.replace(/\s+/gu, " ").trim();
  return flat ? truncateDisplay(flat, Math.max(1, width)) : undefined;
}

export function applyMcpListing(
  state: McpPanelState,
  requestId: number,
  entries: readonly TuiMcpServerEntry[] | undefined,
): McpPanelState {
  if (requestId !== state.requestId) return state;
  if (!entries) return { ...state, loadFailed: true };
  return {
    ...state,
    entries,
    loadFailed: false,
    selectedIndex: clampIndex(state.selectedIndex, entries.length),
  };
}

/** Folds a toggle/reconnect result back in; the returned entry replaces the row in place. */
export function applyMcpActionResult(
  state: McpPanelState,
  name: string,
  action: "reconnect" | "setEnabled",
  result: TuiMcpActionResult,
): McpPanelState {
  const pending = state.pending.filter((candidate) => candidate !== name);
  if (!result.ok) {
    return { ...state, notice: { kind: "failed", message: result.message, name }, pending };
  }
  const entries = state.entries?.map((entry) => (entry.name === name ? result.entry : entry));
  const outcome =
    action === "reconnect" ? "reconnected" : isMcpDisabled(result.entry) ? "disabled" : "enabled";
  return { ...state, entries, notice: { kind: "done", name, outcome }, pending };
}

export function reduceMcpKey(state: McpPanelState, key: ReviewKey): McpKeyResult {
  if (key.ctrl || key.meta) return { consumed: false, state };
  const entries = state.entries ?? [];
  const count = entries.length;
  const char = keyChar(key);
  const selected = entries[state.selectedIndex];
  const move = (index: number): McpKeyResult => ({
    consumed: true,
    state: { ...state, notice: undefined, selectedIndex: clampIndex(index, count) },
  });

  if (key.name === "escape" || char === "q") {
    return { consumed: true, effect: { type: "close" }, state };
  }
  if (char === "R") {
    const requestId = state.requestId + 1;
    return {
      consumed: true,
      effect: { requestId, type: "load" },
      state: { ...state, notice: undefined, requestId },
    };
  }
  if (key.name === "up" || char === "k") return move(state.selectedIndex - 1);
  if (key.name === "down" || char === "j") return move(state.selectedIndex + 1);
  if (key.name === "pageup") return move(state.selectedIndex - MCP_PAGE_SIZE);
  if (key.name === "pagedown") return move(state.selectedIndex + MCP_PAGE_SIZE);
  if (key.name === "home" || char === "g") return move(0);
  if (key.name === "end" || char === "G") return move(count - 1);
  if (!selected) return { consumed: true, state };

  if (key.name === "space" || char === " " || key.name === "return") {
    if (state.pending.includes(selected.name)) return { consumed: true, state };
    if (!selected.toggleable) {
      return { consumed: true, state: { ...state, notice: { entry: selected, kind: "readOnly" } } };
    }
    return {
      consumed: true,
      effect: { enabled: isMcpDisabled(selected), name: selected.name, type: "setEnabled" },
      state: { ...state, notice: undefined, pending: [...state.pending, selected.name] },
    };
  }
  if (char === "r") {
    if (state.pending.includes(selected.name)) return { consumed: true, state };
    if (isMcpDisabled(selected)) {
      return {
        consumed: true,
        state: { ...state, notice: { kind: "needsEnabled", name: selected.name } },
      };
    }
    return {
      consumed: true,
      effect: { name: selected.name, type: "reconnect" },
      state: { ...state, notice: undefined, pending: [...state.pending, selected.name] },
    };
  }
  const isExpanded = state.expanded.includes(selected.name);
  if (char === "t") return setExpanded(state, selected.name, !isExpanded);
  if (key.name === "right" || char === "l") return setExpanded(state, selected.name, true);
  if (key.name === "left" || char === "h") return setExpanded(state, selected.name, false);
  return { consumed: true, state };
}

function setExpanded(state: McpPanelState, name: string, expanded: boolean): McpKeyResult {
  const rest = state.expanded.filter((candidate) => candidate !== name);
  return {
    consumed: true,
    state: { ...state, expanded: expanded ? [...rest, name] : rest },
  };
}

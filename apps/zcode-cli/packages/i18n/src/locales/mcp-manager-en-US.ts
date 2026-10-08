// `/mcp` manager copy (specs/tui/mcp-manager.md); kept apart so en-US.ts stays under the line limit.
import type { ZCodeCopy } from "../types.js";

export const enUSMcpManagerCopy: ZCodeCopy["tui"]["mcp"] = {
  title: " MCP ",
  listHelp: "Up/Down move · Space toggle · r reconnect · t tools · R refresh · Esc close",
  header: ({ connected, disabled, enabled }) =>
    `${connected}/${enabled} connected${disabled > 0 ? `, ${disabled} disabled` : ""}`,
  loading: "Loading MCP servers...",
  empty: "No MCP servers configured.",
  loadFailed: "MCP status unavailable. Press R to retry.",
  unavailable: "The MCP manager is not available in this client.",
  closed: "MCP manager closed.",
  pendingApproval: "An approval request is waiting. Press Esc to return to it.",
  working: "working...",
  noTools: "no tools",
  toolsHeading: (count) => `${count} ${count === 1 ? "tool" : "tools"}:`,
  status: {
    connected: "connected",
    connecting: "connecting",
    disabled: "disabled",
    disconnected: "disconnected",
    failed: "failed",
    needsAuth: "needs auth",
    untrusted: "untrusted",
  },
  origin: {
    builtin: "built-in",
    cli: "cli",
    env: "env",
    host: "host",
    plugin: "plugin",
    project: "project",
    system: "system",
    user: "user",
  },
  notice: {
    disabled: (name) => `${name} disabled; its tools were removed from this session.`,
    enabled: (name) => `${name} enabled.`,
    failed: ({ message, name }) => `${name}: ${message}`,
    needsEnabled: (name) => `${name} is disabled; enable it first (Space).`,
    readOnlyBuiltin: ({ name, plugins }) =>
      `${name} is provided by ${plugins || "a plugin"}; manage it with /plugins disable <id>.`,
    readOnlyOther: ({ name, origin }) =>
      `${name} comes from ${origin} configuration and cannot be toggled here.`,
    readOnlyPlugin: ({ name, plugins }) =>
      `${name} is provided by plugin ${plugins || "(unknown)"}; manage it with /plugins.`,
    reconnected: (name) => `${name} reconnected.`,
  },
};

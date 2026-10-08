// Injected provider contract for the /mcp manager view (specs/tui/mcp-manager.md section 3).
// Structurally mirrors bootstrap's ZCodeMcpServerEntry; the CLI adapts one to the other so the
// TUI never imports bootstrap. The TUI owns no MCP state: it only renders these entries.
import type { McpServerStatus } from "@zcode/contracts";

export type TuiMcpServerOrigin =
  | "user"
  | "project"
  | "plugin"
  | "builtin"
  | "env"
  | "cli"
  | "system"
  | "host";

export type TuiMcpServerEntry = {
  configPath?: string;
  name: string;
  origin: TuiMcpServerOrigin;
  ownerPluginIds?: readonly string[];
  status: McpServerStatus;
  toggleable: boolean;
  toolNames: readonly string[];
};

export type TuiMcpActionErrorCode =
  | "apply_failed"
  | "disabled"
  | "mcp_unavailable"
  | "not_configured"
  | "persist_failed"
  | "read_only";

export type TuiMcpActionResult =
  | { entry: TuiMcpServerEntry; ok: true }
  | { code: TuiMcpActionErrorCode; message: string; ok: false };

export type TuiMcpManager = {
  list(): Promise<readonly TuiMcpServerEntry[]>;
  reconnect(name: string): Promise<TuiMcpActionResult>;
  setEnabled(name: string, enabled: boolean): Promise<TuiMcpActionResult>;
};

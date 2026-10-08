// MCP manager app surface (specs/tui/mcp-manager.md section 3).
import type { McpServerStatus } from "@zcode/contracts";

/** Where a server's definition comes from; decides whether the manager may toggle it. */
export type ZCodeMcpServerOrigin =
  | "user"
  | "project"
  | "plugin"
  | "builtin"
  | "env"
  | "cli"
  | "system"
  | "host";

export interface ZCodeMcpServerEntry {
  name: string;
  status: McpServerStatus;
  origin: ZCodeMcpServerOrigin;
  /** Config file that owns the `enabled` flag (user/project origins only). */
  configPath?: string;
  /** Plugin ids that own the server (plugin/builtin origins), for the "manage with /plugins" hint. */
  ownerPluginIds?: string[];
  toggleable: boolean;
  toolNames: string[];
}

export type ZCodeMcpServerActionErrorCode =
  | "apply_failed"
  | "disabled"
  | "mcp_unavailable"
  | "not_configured"
  | "persist_failed"
  | "read_only";

export type ZCodeMcpServerActionResult =
  | { entry: ZCodeMcpServerEntry; ok: true }
  | { code: ZCodeMcpServerActionErrorCode; message: string; ok: false };

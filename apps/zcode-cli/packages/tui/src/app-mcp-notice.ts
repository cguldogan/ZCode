// Labels, tones and notice text of the /mcp manager (specs/tui/mcp-manager.md); pure.
import type { TuiCopy } from "@zcode/i18n";
import type { McpDisplayStatus, McpNotice } from "./app-mcp-state.js";

export type McpLineTone = "accent" | "danger" | "muted" | "success" | "text" | "warning";

export function mcpStatusLabel(copy: TuiCopy, status: McpDisplayStatus): string {
  const labels = copy.mcp.status;
  return status === "needs_auth" ? labels.needsAuth : labels[status];
}

export function mcpStatusTone(status: McpDisplayStatus, selected: boolean): McpLineTone {
  if (status === "connected") return "success";
  if (status === "failed") return "danger";
  if (status === "connecting" || status === "needs_auth" || status === "untrusted") {
    return "warning";
  }
  // Disabled / disconnected rows are dimmed unless selected.
  return selected ? "text" : "muted";
}

export function mcpNoticeText(copy: TuiCopy, notice: McpNotice): string {
  const labels = copy.mcp.notice;
  if (notice.kind === "done") return labels[notice.outcome](notice.name);
  if (notice.kind === "failed")
    return labels.failed({ message: notice.message, name: notice.name });
  if (notice.kind === "needsEnabled") return labels.needsEnabled(notice.name);
  const { entry } = notice;
  const plugins = (entry.ownerPluginIds ?? []).join(", ");
  if (entry.origin === "builtin") return labels.readOnlyBuiltin({ name: entry.name, plugins });
  if (entry.origin === "plugin") return labels.readOnlyPlugin({ name: entry.name, plugins });
  return labels.readOnlyOther({ name: entry.name, origin: copy.mcp.origin[entry.origin] });
}

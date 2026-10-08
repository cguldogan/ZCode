import type { McpServerStatus, McpServerStatusKind } from "@zcode/contracts";
import type { TuiCopy } from "@zcode/i18n";
import React from "react";
import type { McpSidebarState } from "./app-model.js";
import { palette } from "./app-model.js";
import { SIDEBAR_CONTENT_WIDTH } from "./app-sidebar-layout.js";
import { mcpDisplayStatus, shortMcpError, summarizeMcpStatuses } from "./app-mcp-state.js";
import { SidebarSectionHeader } from "./app-sidebar-section-header.js";
import { displayWidth, truncateDisplay } from "./app-terminal-width.js";

const h = React.createElement as (
  type: React.ElementType | string,
  props?: Record<string, unknown> | null,
  ...children: React.ReactNode[]
) => React.ReactElement;

const MCP_SERVER_ROW_LIMIT = 5;
const MCP_STATUS_WIDTH = 12;
const MCP_META_WIDTH = 13;
const MCP_NAME_WIDTH = SIDEBAR_CONTENT_WIDTH - MCP_STATUS_WIDTH - MCP_META_WIDTH - 2;
const SIDEBAR_LABEL_WIDTH = 9;
const SIDEBAR_ROW_VALUE_WIDTH = SIDEBAR_CONTENT_WIDTH - SIDEBAR_LABEL_WIDTH - 1;
const SIDEBAR_TEXT_ROW_STYLE = { flexShrink: 0, height: 1, truncate: true, wrapMode: "none" };

export function McpSection(props: {
  copy: TuiCopy;
  expanded: boolean;
  mcpStatus: McpSidebarState;
  onToggle?: () => void;
}): React.ReactElement {
  return h(
    "box",
    {
      style: {
        flexDirection: "column",
        flexShrink: 0,
        marginTop: 1,
      },
    },
    SidebarSectionHeader({
      expanded: props.expanded,
      onToggle: props.onToggle,
      title: props.copy.sidebar.sections.mcp,
    }),
    ...(props.expanded ? mcpLines(props.copy, props.mcpStatus) : []),
  );
}

function mcpLines(copy: TuiCopy, state: McpSidebarState): React.ReactNode[] {
  const entries = Object.entries(state.servers).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  // Disabled servers are intentionally off, so they are not counted as "expected connected";
  // they are reported separately instead (specs/tui/mcp-manager.md section 1).
  const counts = summarizeMcpStatuses(entries.map(([, server]) => server));
  const summary = copy.sidebar.mcp.summary({ connected: counts.connected, total: counts.enabled });
  const lines = [
    rowLine(
      copy.sidebar.mcp.servers,
      counts.disabled > 0
        ? `${summary}, ${copy.sidebar.mcp.disabledCount(counts.disabled)}`
        : summary,
      "mcp-summary",
    ),
  ];

  if (state.loading && entries.length === 0) {
    lines.push(textLine(copy.sidebar.mcp.loading, palette.muted, "mcp-loading"));
    return lines;
  }
  if (entries.length === 0) {
    lines.push(
      textLine(
        state.error ? copy.sidebar.mcp.loadFailed : copy.sidebar.mcp.empty,
        errorColor(state),
        "mcp-empty",
      ),
    );
    if (state.error) lines.push(textLine(state.error, palette.danger, "mcp-error"));
    return lines;
  }

  for (const [name, status] of entries.slice(0, MCP_SERVER_ROW_LIMIT)) {
    lines.push(mcpServerLine(copy, name, status));
    // Failed servers get one short reason line; the full text is in /mcp.
    const reason =
      status.status === "failed" ? shortMcpError(status.error, SIDEBAR_CONTENT_WIDTH) : undefined;
    if (reason) lines.push(textLine(reason, palette.danger, `mcp-${name}-error`));
  }
  if (entries.length > MCP_SERVER_ROW_LIMIT) {
    lines.push(
      textLine(
        copy.sidebar.mcp.more(entries.length - MCP_SERVER_ROW_LIMIT),
        palette.muted,
        "mcp-more",
      ),
    );
  }
  if (state.error) {
    lines.push(textLine(copy.sidebar.mcp.loadFailed, palette.warning, "mcp-refresh-error"));
  }
  lines.push(textLine(copy.sidebar.mcp.hint, palette.muted, "mcp-hint"));
  return lines;
}

function mcpServerLine(copy: TuiCopy, name: string, status: McpServerStatus): React.ReactElement {
  // OAuth-pending connections read as "connecting" in the sidebar; /mcp spells out "needs auth".
  const display = mcpDisplayStatus(status);
  const statusLabel = copy.sidebar.mcp.status[display === "needs_auth" ? "connecting" : display];
  const meta = `${status.transport} ${copy.sidebar.mcp.tools(status.toolCount)}`;
  return textLine(
    `${padEndDisplay(statusLabel, MCP_STATUS_WIDTH)} ${truncateDisplay(name, MCP_NAME_WIDTH)} ${truncateDisplay(meta, MCP_META_WIDTH)}`,
    serverStatusColor(status.status),
    `mcp-${name}`,
  );
}

function rowLine(label: string, value: string, key: string): React.ReactElement {
  return textLine(
    `${padEndDisplay(label, SIDEBAR_LABEL_WIDTH)} ${truncateDisplay(value, SIDEBAR_ROW_VALUE_WIDTH)}`,
    palette.text,
    key,
  );
}

function textLine(value: string, color: string, key: string): React.ReactElement {
  return h("text", { key, style: { ...SIDEBAR_TEXT_ROW_STYLE, fg: color } }, value);
}

function padEndDisplay(value: string, targetCells: number): string {
  const visible = truncateDisplay(value, targetCells);
  return `${visible}${" ".repeat(Math.max(0, targetCells - displayWidth(visible)))}`;
}

function serverStatusColor(status: McpServerStatusKind): string {
  if (status === "connected") return palette.success;
  if (status === "connecting") return palette.accent;
  if (status === "failed") return palette.danger;
  if (status === "untrusted") return palette.warning;
  return palette.muted;
}

function errorColor(state: McpSidebarState): string {
  return state.error ? palette.warning : palette.muted;
}

// Pure line model of the /mcp manager list (specs/tui/mcp-manager.md): rows, detail lines and
// expanded tool names as plain text plus a semantic tone, so truncation and compact layout are
// unit-tested without a renderer. The view only paints these lines.
import type { TuiCopy } from "@zcode/i18n";
import {
  isMcpDisabled,
  mcpDisplayStatus,
  shortMcpError,
  type McpDisplayStatus,
  type McpNotice,
  type McpPanelState,
} from "./app-mcp-state.js";
import { displayWidth, truncateDisplay } from "./app-terminal-width.js";
import type { TuiMcpServerEntry } from "./mcp-manager-types.js";

export type McpLineTone = "accent" | "danger" | "muted" | "success" | "text" | "warning";
export type McpLine = {
  /** Index of the entry this line belongs to (for scrolling the selection into view). */
  entryIndex: number;
  key: string;
  text: string;
  tone: McpLineTone;
};

const SELECTOR = 2;
const STATUS_WIDTH = 11;
/** Below this width the origin column is dropped from rows (shown on the selected detail line). */
const COMPACT_WIDTH = 64;
const DETAIL_INDENT = "    ";
const MAX_TOOL_LINES = 12;

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
  if (notice.kind === "failed") return labels.failed({ message: notice.message, name: notice.name });
  if (notice.kind === "needsEnabled") return labels.needsEnabled(notice.name);
  const { entry } = notice;
  const plugins = (entry.ownerPluginIds ?? []).join(", ");
  if (entry.origin === "builtin") return labels.readOnlyBuiltin({ name: entry.name, plugins });
  if (entry.origin === "plugin") return labels.readOnlyPlugin({ name: entry.name, plugins });
  return labels.readOnlyOther({ name: entry.name, origin: copy.mcp.origin[entry.origin] });
}

export function buildMcpLines(input: {
  copy: TuiCopy;
  entries: readonly TuiMcpServerEntry[];
  state: McpPanelState;
  width: number;
}): McpLine[] {
  const { copy, entries, state, width } = input;
  const compact = width < COMPACT_WIDTH;
  const lines: McpLine[] = [];
  entries.forEach((entry, index) => {
    const selected = index === state.selectedIndex;
    const display = mcpDisplayStatus(entry.status);
    const tone = mcpStatusTone(display, selected);
    const pending = state.pending.includes(entry.name);
    const tools = copy.sidebar.mcp.tools(entry.status.toolCount);
    const origin = copy.mcp.origin[entry.origin];
    const meta = compact
      ? `${entry.status.transport} ${tools}`
      : `${entry.status.transport} ${origin} ${tools}`;
    const status = pending ? copy.mcp.working : mcpStatusLabel(copy, display);
    const prefix = `${selected ? "> " : "  "}${padCells(status, STATUS_WIDTH)} `;
    const nameBudget = Math.max(1, width - displayWidth(prefix) - displayWidth(meta) - 1);
    const name = padCells(truncateDisplay(entry.name, nameBudget), nameBudget);
    lines.push({
      entryIndex: index,
      key: `row:${entry.name}`,
      text: truncateDisplay(`${prefix}${name} ${meta}`, width),
      tone: selected && tone === "muted" ? "text" : tone,
    });
    const detail = detailText(copy, entry, selected, compact, width - DETAIL_INDENT.length);
    if (detail) {
      lines.push({
        entryIndex: index,
        key: `detail:${entry.name}`,
        text: `${DETAIL_INDENT}${detail.text}`,
        tone: detail.tone,
      });
    }
    if (state.expanded.includes(entry.name)) {
      lines.push(...toolLines(copy, entry, index, width));
    }
  });
  return lines;
}

function detailText(
  copy: TuiCopy,
  entry: TuiMcpServerEntry,
  selected: boolean,
  compact: boolean,
  width: number,
): { text: string; tone: McpLineTone } | undefined {
  const error = shortMcpError(entry.status.error, width);
  // Failed servers always show why; other errors (untrusted etc.) show on the selected row.
  if (error && (entry.status.status === "failed" || selected)) {
    return { text: error, tone: entry.status.status === "failed" ? "danger" : "warning" };
  }
  if (selected) {
    const where = entry.configPath ?? entry.ownerPluginIds?.join(", ");
    const text = compact ? `${copy.mcp.origin[entry.origin]}${where ? ` ${where}` : ""}` : where;
    if (text) return { text: truncateDisplay(text, width), tone: "muted" };
  }
  return undefined;
}

function toolLines(
  copy: TuiCopy,
  entry: TuiMcpServerEntry,
  entryIndex: number,
  width: number,
): McpLine[] {
  const indent = DETAIL_INDENT;
  const make = (key: string, text: string, tone: McpLineTone): McpLine => ({
    entryIndex,
    key: `tool:${entry.name}:${key}`,
    text: truncateDisplay(`${indent}${text}`, width),
    tone,
  });
  if (isMcpDisabled(entry) || entry.toolNames.length === 0) {
    return [make("none", `- ${copy.mcp.noTools}`, "muted")];
  }
  const shown = entry.toolNames.slice(0, MAX_TOOL_LINES);
  return [
    make("heading", `- ${copy.mcp.toolsHeading(entry.toolNames.length)}`, "muted"),
    ...shown.map((tool) => make(tool, `  ${tool}`, "text")),
    ...(entry.toolNames.length > shown.length
      ? [make("more", `  ${copy.sidebar.mcp.more(entry.toolNames.length - shown.length)}`, "muted")]
      : []),
  ];
}

/** The slice of lines that keeps the selected row's lines in view within `maxLines`. */
export function windowMcpLines(
  lines: readonly McpLine[],
  selectedIndex: number,
  maxLines: number,
): McpLine[] {
  if (lines.length <= maxLines) return [...lines];
  const first = lines.findIndex((line) => line.entryIndex === selectedIndex);
  const last = lines.findLastIndex((line) => line.entryIndex === selectedIndex);
  const end = Math.max(Math.min(lines.length, last + 1), maxLines);
  const start = Math.max(0, Math.min(first, end - maxLines));
  return lines.slice(start, Math.min(lines.length, start + maxLines));
}

function padCells(value: string, cells: number): string {
  const visible = truncateDisplay(value, cells);
  return `${visible}${" ".repeat(Math.max(0, cells - displayWidth(visible)))}`;
}

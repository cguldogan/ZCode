// /mcp full-screen manager view (specs/tui/mcp-manager.md). Rendering only: state lives in
// app-mcp-state.ts and the row text in app-mcp-lines.ts.
import { useTerminalDimensions } from "@mbears/opentui-react";
import type { TuiCopy } from "@zcode/i18n";
import React from "react";
import { buildMcpLines, mcpNoticeText, windowMcpLines, type McpLineTone } from "./app-mcp-lines.js";
import type { McpPanelController } from "./app-mcp-panel.js";
import { summarizeMcpStatuses } from "./app-mcp-state.js";
import { palette } from "./app-model.js";
import { truncateDisplay } from "./app-terminal-width.js";

const h = React.createElement as (
  type: React.ElementType | string,
  props?: Record<string, unknown> | null,
  ...children: React.ReactNode[]
) => React.ReactElement;

/** Title, help, notice, approval banner and borders around the list. */
const MCP_CHROME_ROWS = 9;
const MCP_MIN_VISIBLE_LINES = 4;

const TONE_COLOR: Record<McpLineTone, string> = {
  accent: palette.accent,
  danger: palette.danger,
  muted: palette.muted,
  success: palette.success,
  text: palette.text,
  warning: palette.warning,
};

export function McpView(props: {
  contentWidth: number;
  controller: McpPanelController;
  copy: TuiCopy;
  pendingApproval: boolean;
}): React.ReactElement | null {
  const { height } = useTerminalDimensions();
  const state = props.controller.state;
  if (!state) return null;
  const labels = props.copy.mcp;
  const entries = state.entries;
  const summary = entries
    ? labels.header(summarizeMcpStatuses(entries.map((entry) => entry.status)))
    : "";
  const width = props.contentWidth;

  const body = (() => {
    if (!entries) {
      return message(state.loadFailed ? labels.loadFailed : labels.loading, state.loadFailed);
    }
    if (entries.length === 0) return message(labels.empty, false);
    const lines = windowMcpLines(
      buildMcpLines({ copy: props.copy, entries, state, width }),
      state.selectedIndex,
      Math.max(MCP_MIN_VISIBLE_LINES, height - MCP_CHROME_ROWS),
    );
    return h(
      "box",
      { style: { flexDirection: "column", flexGrow: 1, minHeight: 0 } },
      ...lines.map((line) =>
        h(
          "text",
          { key: line.key, style: { fg: TONE_COLOR[line.tone], flexShrink: 0, height: 1 } },
          line.text,
        ),
      ),
    );
  })();

  return h(
    "box",
    { id: "mcp-view", style: { flexDirection: "column", flexGrow: 1, minHeight: 0 } },
    h(
      "text",
      { style: { fg: palette.accent, flexShrink: 0, height: 1 } },
      truncateDisplay(`${labels.title.trim()}  ${summary}`, width),
    ),
    h(
      "text",
      { style: { fg: palette.muted, flexShrink: 0, height: 1 } },
      truncateDisplay(labels.listHelp, width),
    ),
    props.pendingApproval
      ? h("text", { style: { fg: palette.warning, flexShrink: 0 } }, labels.pendingApproval)
      : null,
    state.notice
      ? h(
          "text",
          {
            style: {
              fg: state.notice.kind === "failed" ? palette.danger : palette.warning,
              flexShrink: 0,
              height: 1,
            },
          },
          truncateDisplay(mcpNoticeText(props.copy, state.notice), width),
        )
      : null,
    body,
  );
}

function message(text: string, error: boolean): React.ReactElement {
  return h(
    "text",
    { style: { fg: error ? palette.danger : palette.muted, wrapMode: "word" } },
    text,
  );
}

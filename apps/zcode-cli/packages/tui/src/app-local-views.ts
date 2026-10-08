// The local, read-only full-screen views (/review and /mcp) bundled for TuiApp. Grouping them
// keeps app.tsx under the line limit and gives the keyboard, submit controller and AppView one
// object to spread instead of a prop per view.
import type { TuiCopy } from "@zcode/i18n";
import React from "react";
import { useMcpPanel } from "./app-mcp-panel.js";
import { useReviewPanel } from "./app-review-panel.js";
import type { TuiOptions } from "./types.js";

export function useLocalViews(input: {
  copy: TuiCopy;
  options: TuiOptions;
  setStatus: (status: string) => void;
}) {
  const { copy, options, setStatus } = input;
  const review = useReviewPanel({ copy, provider: options.workspaceReview, setStatus });
  // Bumped after a toggle/reconnect so the sidebar MCP block refreshes now, not on its next poll.
  const [mcpVersion, setMcpVersion] = React.useState(0);
  const bumpMcpVersion = React.useCallback(() => setMcpVersion((version) => version + 1), []);
  const mcp = useMcpPanel({
    copy,
    manager: options.mcpManager,
    onChanged: bumpMcpVersion,
    setStatus,
  });
  return {
    /** Spread into useSubmitValue. */
    openers: { openMcp: mcp.open, openReview: review.open },
    /** Spread into useTuiKeyboardControls and AppView. */
    panels: { mcp, mcpVersion, review },
  };
}

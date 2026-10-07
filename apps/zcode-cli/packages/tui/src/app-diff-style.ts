// `tui.diffStyle` (specs/tui/diff-review-undo.md §3). The config value is resolved once at TUI
// start and provided through React context so every ShikiDiffView (tool calls, subagent
// transcripts, /review) honors it without threading a prop through each component.
import { normalizeTuiDiffStyle, type TuiDiffStyle } from "@zcode/contracts";
import React from "react";

export type DiffViewMode = "split" | "unified";

/** Content wider than this renders side-by-side in "auto" mode. */
export const SPLIT_DIFF_WIDTH_BREAKPOINT = 120;

export const TuiDiffStyleContext = React.createContext<TuiDiffStyle>("auto");

export function resolveDiffViewMode(style: unknown, terminalWidth: number): DiffViewMode {
  if (normalizeTuiDiffStyle(style) === "stacked") return "unified";
  return terminalWidth > SPLIT_DIFF_WIDTH_BREAKPOINT ? "split" : "unified";
}

export function useDiffStyle(): TuiDiffStyle {
  return React.useContext(TuiDiffStyleContext);
}

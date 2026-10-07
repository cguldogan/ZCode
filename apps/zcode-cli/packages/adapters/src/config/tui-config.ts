// TUI section of the CLI config file (specs/tui/diff-review-undo.md §3).
//
// The `tui` block is purely presentational. An invalid value must never make the whole config
// file fail schema validation (that would silently drop providers, MCP servers, etc.), so the
// raw input is normalized here before the strict schema runs: unknown values fall back to the
// default and surface as a warning diagnostic instead.

import { DEFAULT_TUI_DIFF_STYLE, TUI_DIFF_STYLES, isTuiDiffStyle } from "@zcode/contracts";
import { z } from "zod";

export const TUI_CONFIG_DIAGNOSTIC_CODE = "config_value_invalid" as const;

const TUI_SECTION_PATH = "tui";
const TUI_DIFF_STYLE_PATH = "tui.diffStyle";

export const tuiConfigSchema = z
  .object({
    diffStyle: z.enum(TUI_DIFF_STYLES).optional(),
  })
  .passthrough();

export interface TuiConfigDiagnostic {
  code: typeof TUI_CONFIG_DIAGNOSTIC_CODE;
  message: string;
  path: string;
  severity: "warning";
}

export function normalizeTuiConfigInput(
  root: Record<string, unknown>,
  diagnostics: { push(diagnostic: TuiConfigDiagnostic): unknown },
): Record<string, unknown> {
  if (!(TUI_SECTION_PATH in root) || root.tui === undefined) return root;

  const section = root.tui;
  if (typeof section !== "object" || section === null || Array.isArray(section)) {
    diagnostics.push({
      code: TUI_CONFIG_DIAGNOSTIC_CODE,
      message: "tui must be a JSON object; ignoring the tui section.",
      path: TUI_SECTION_PATH,
      severity: "warning",
    });
    const { tui: _ignored, ...rest } = root;
    return rest;
  }

  const tui = { ...(section as Record<string, unknown>) };
  if (tui.diffStyle !== undefined && !isTuiDiffStyle(tui.diffStyle)) {
    diagnostics.push({
      code: TUI_CONFIG_DIAGNOSTIC_CODE,
      message: `tui.diffStyle must be one of ${TUI_DIFF_STYLES.join(", ")}; using "${DEFAULT_TUI_DIFF_STYLE}".`,
      path: TUI_DIFF_STYLE_PATH,
      severity: "warning",
    });
    tui.diffStyle = DEFAULT_TUI_DIFF_STYLE;
  }
  return { ...root, tui };
}

// specs/tui/diff-review-undo.md §3 — `tui.diffStyle` parsing, validation and precedence.
import assert from "node:assert/strict";
import test from "node:test";
import { ConfigKey, ConfigScope, normalizeTuiDiffStyle } from "@zcode/contracts";
import { createConfigPort, mergeConfigs, createPrioritizedConfig } from "../src/config/index.js";
import { parseConfigFileToRuntimePatchWithDiagnostics } from "../src/config/schema.js";

test("valid diffStyle values are accepted", () => {
  for (const diffStyle of ["auto", "stacked"] as const) {
    const result = parseConfigFileToRuntimePatchWithDiagnostics({ tui: { diffStyle } });
    assert.deepEqual(result.config.tui, { diffStyle });
    assert.deepEqual(result.diagnostics, []);
  }
});

test("an invalid diffStyle falls back to auto with a warning and keeps the rest of the file", () => {
  const result = parseConfigFileToRuntimePatchWithDiagnostics({
    tui: { diffStyle: "sideways" },
    ui: { theme: "dark" },
  });
  assert.deepEqual(result.config.tui, { diffStyle: "auto" });
  assert.equal(result.config.ui?.theme, "dark");
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0]?.code, "config_value_invalid");
  assert.equal(result.diagnostics[0]?.path, "tui.diffStyle");
  assert.equal(result.diagnostics[0]?.severity, "warning");

  const wrongType = parseConfigFileToRuntimePatchWithDiagnostics({ tui: { diffStyle: 3 } });
  assert.deepEqual(wrongType.config.tui, { diffStyle: "auto" });

  const wrongSection = parseConfigFileToRuntimePatchWithDiagnostics({ tui: "stacked" });
  assert.equal(wrongSection.config.tui, undefined);
  assert.equal(wrongSection.diagnostics[0]?.path, "tui");
});

test("config port exposes tui.diffStyle with an auto default", () => {
  assert.equal(createConfigPort().get(ConfigKey.TuiDiffStyle), "auto");
  assert.equal(createConfigPort().getAll().tui.diffStyle, "auto");
  const port = createConfigPort({ tui: { diffStyle: "stacked" } });
  assert.equal(port.get(ConfigKey.TuiDiffStyle), "stacked");
  assert.equal(port.getAll().tui.diffStyle, "stacked");
});

test("project config overrides user config", () => {
  const merged = mergeConfigs(
    createPrioritizedConfig({ tui: { diffStyle: "auto" } }, ConfigScope.Project),
    createPrioritizedConfig({ tui: { diffStyle: "stacked" } }, ConfigScope.User),
  );
  assert.equal(merged.tui?.diffStyle, "auto");
});

test("normalizeTuiDiffStyle is the single validator", () => {
  assert.equal(normalizeTuiDiffStyle("stacked"), "stacked");
  assert.equal(normalizeTuiDiffStyle("STACKED"), "auto");
  assert.equal(normalizeTuiDiffStyle(undefined), "auto");
  assert.equal(normalizeTuiDiffStyle(null), "auto");
});

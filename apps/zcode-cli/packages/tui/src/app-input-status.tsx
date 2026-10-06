import type { TuiCopy } from "@zcode/i18n";
import { homedir } from "node:os";
import React from "react";
import type { ContextUsage } from "./app-model.js";
import { DEFAULT_TUI_COPY } from "./app-locale.js";
import { palette } from "./app-model.js";
import { modelDisplayParts } from "./app-model-ref.js";
import { spinnerFrame, useSpinnerFrame } from "./app-motion.js";
import { displayWidth, truncateDisplay } from "./app-terminal-width.js";
import { formatTokensPerSecond, type ModelThroughput } from "./app-throughput.js";

const h = React.createElement as (
  type: React.ElementType | string,
  props?: Record<string, unknown> | null,
  ...children: React.ReactNode[]
) => React.ReactElement;

const ACTIVE_STATUS_HEIGHT = 1;
const ACTIVE_STATUS_HORIZONTAL_PADDING_WIDTH = 1;
const ACTIVE_STATUS_CONTEXT_SPACER_WIDTH = 1;
const COMPOSER_STATUS_HEIGHT = 1;
const COMPOSER_STATUS_HORIZONTAL_PADDING_WIDTH = 0;
const COMPOSER_STATUS_MIN_METADATA_WIDTH = 8;
const STATUS_MIN_CONTEXT_WIDTH = 4;
const COMPOSER_STATUS_FALLBACK_WIDTH = 80;
const COMPOSER_STATUS_MIN_CONTENT_WIDTH = 8;
const TOKEN_COUNT_KILO = 1_000;
const TOKEN_COUNT_MEGA = TOKEN_COUNT_KILO * TOKEN_COUNT_KILO;
const TOKEN_COUNT_DECIMAL_PLACES = 1;

const STATUS_SEGMENT_SEPARATOR = " · ";
const STATUS_GIT_BRANCH_PREFIX = "⎇ ";

type InputStatusRowOptions = {
  contentWidth?: number;
  contextUsage?: ContextUsage;
  throughput?: ModelThroughput;
  workspaceDirectory?: string;
  workspaceGitBranch?: string;
};

type InputComposerStatusParts = {
  model: string;
  provider: string;
  thought: string;
};

export function InputActiveStatus({
  active,
  copy = DEFAULT_TUI_COPY,
  frameMs,
  ...options
}: InputStatusRowOptions & {
  active: boolean;
  copy?: TuiCopy;
  frameMs?: number;
}): React.ReactElement {
  if (frameMs !== undefined || !active) {
    return inputActiveStatusRow(copy, active ? spinnerFrame(frameMs ?? 0) : undefined, options);
  }
  return h(InputActiveStatusContent, { ...options, copy });
}

function InputActiveStatusContent({
  copy,
  ...options
}: InputStatusRowOptions & { copy: TuiCopy }): React.ReactElement {
  return inputActiveStatusRow(copy, useSpinnerFrame(true), options);
}

export function InputComposerStatus({
  contentWidth,
  model,
  thoughtLevel,
}: {
  contentWidth?: number;
  model: string;
  thoughtLevel: string;
}): React.ReactElement {
  return inputComposerStatusRow({
    contentWidth,
    model,
    thoughtLevel,
  });
}

function inputActiveStatusRow(
  copy: TuiCopy,
  frame?: string,
  options: InputStatusRowOptions = {},
): React.ReactElement {
  const contextBadge = fitStatusContextBadge(
    inputStatusMetricsBadge(options),
    activeStatusContextBadgeWidth({
      contentWidth: options.contentWidth,
      copy,
      frame,
    }),
  );
  // The busy hint owns the left side while a turn runs; otherwise show where the session works.
  const location = frame
    ? undefined
    : fitStatusLocation(
        inputStatusLocation(options.workspaceDirectory, options.workspaceGitBranch),
        statusLocationWidth(options.contentWidth, contextBadge),
      );
  return h(
    "box",
    {
      style: {
        flexDirection: "row",
        height: ACTIVE_STATUS_HEIGHT,
        paddingLeft: 1,
        width: "100%",
      },
    },
    frame
      ? h(
          "box",
          { style: { flexDirection: "row", flexShrink: 0 } },
          h(
            "text",
            { style: { fg: palette.accent, flexShrink: 0, width: displayWidth(frame) } },
            frame,
          ),
          h("text", { style: { fg: palette.muted } }, " "),
          h("text", { style: { fg: palette.muted } }, copy.input.activeStatusHint),
        )
      : null,
    location ? h("text", { style: { fg: palette.muted, flexShrink: 1 } }, location) : null,
    contextBadge ? h("box", { style: { flexGrow: 1, minWidth: 1 } }) : null,
    contextBadge ? h("text", { style: { fg: palette.muted, flexShrink: 0 } }, contextBadge) : null,
  );
}

function inputComposerStatusRow({
  contentWidth,
  model,
  thoughtLevel,
}: {
  contentWidth?: number;
  model: string;
  thoughtLevel: string;
}): React.ReactElement {
  const parts = inputComposerStatusParts(
    model,
    thoughtLevel,
    composerStatusMetadataWidth(contentWidth),
  );
  return h(
    "box",
    {
      style: {
        alignItems: "center",
        flexDirection: "row",
        flexShrink: 0,
        height: COMPOSER_STATUS_HEIGHT,
        width: "100%",
      },
    },
    h(
      "box",
      { style: { flexDirection: "row", flexShrink: 1, minWidth: 1 } },
      h("text", { style: { fg: palette.text, flexShrink: 1 } }, parts.model),
      h("text", { style: { fg: palette.muted } }, ` ${parts.provider} | `),
      h("text", { style: { fg: palette.warning, flexShrink: 0 } }, parts.thought),
    ),
  );
}

function inputComposerStatusParts(
  modelSelection: string,
  thoughtLevel: string,
  maxWidth?: number,
): InputComposerStatusParts {
  const modelParts = modelDisplayParts(modelSelection);
  const thought = thoughtLevel.trim();
  return fitComposerStatusParts(
    {
      ...modelParts,
      thought: thought || "-",
    },
    maxWidth,
  );
}

function inputContextUsageBadge(contextUsage?: ContextUsage): string | undefined {
  const used = contextUsage?.contextUsed;
  if (!validContextTokenCount(used)) return undefined;

  const usedLabel = formatCompactTokenCount(used);
  const window = contextUsage?.contextWindow;
  if (!validContextWindow(window)) return usedLabel;

  return `${usedLabel} (${formatComposerPercent(used / window)})`;
}

/** Right-hand metrics: last model output speed, then context usage. */
function inputStatusMetricsBadge(options: InputStatusRowOptions): string | undefined {
  const segments = [
    formatTokensPerSecond(options.throughput),
    inputContextUsageBadge(options.contextUsage),
  ].filter((segment): segment is string => segment !== undefined);
  return segments.length > 0 ? segments.join(STATUS_SEGMENT_SEPARATOR) : undefined;
}

export function inputStatusLocation(
  workspaceDirectory?: string,
  workspaceGitBranch?: string,
  home = homedir(),
): string | undefined {
  const directory = workspaceDirectory?.trim()
    ? abbreviateHomeDirectory(workspaceDirectory.trim(), home)
    : undefined;
  const branch = workspaceGitBranch?.trim()
    ? `${STATUS_GIT_BRANCH_PREFIX}${workspaceGitBranch.trim()}`
    : undefined;
  const segments = [directory, branch].filter((segment): segment is string => !!segment);
  return segments.length > 0 ? segments.join(" ") : undefined;
}

function abbreviateHomeDirectory(directory: string, home: string): string {
  if (!home || home === "/") return directory;
  if (directory === home) return "~";
  return directory.startsWith(`${home}/`) ? `~${directory.slice(home.length)}` : directory;
}

function statusLocationWidth(contentWidth: number | undefined, metricsBadge?: string): number {
  const rowWidth = normalizeComposerStatusContentWidth(contentWidth);
  const metricsWidth = metricsBadge
    ? displayWidth(metricsBadge) + ACTIVE_STATUS_CONTEXT_SPACER_WIDTH
    : 0;
  return rowWidth - ACTIVE_STATUS_HORIZONTAL_PADDING_WIDTH - metricsWidth;
}

function fitStatusLocation(location: string | undefined, maxWidth: number): string | undefined {
  if (location === undefined || maxWidth < STATUS_MIN_CONTEXT_WIDTH) return undefined;
  return truncateDisplay(location, Math.floor(maxWidth));
}

function composerStatusMetadataWidth(contentWidth?: number): number {
  const rowWidth = normalizeComposerStatusContentWidth(contentWidth);
  return Math.max(
    COMPOSER_STATUS_MIN_METADATA_WIDTH,
    rowWidth - COMPOSER_STATUS_HORIZONTAL_PADDING_WIDTH,
  );
}

function activeStatusContextBadgeWidth({
  contentWidth,
  copy,
  frame,
}: {
  contentWidth?: number;
  copy: TuiCopy;
  frame?: string;
}): number | undefined {
  const rowWidth = normalizeComposerStatusContentWidth(contentWidth);
  const activeHintWidth = frame
    ? displayWidth(frame) + 1 + displayWidth(copy.input.activeStatusHint)
    : 0;
  const activeSpacerWidth = activeHintWidth > 0 ? ACTIVE_STATUS_CONTEXT_SPACER_WIDTH : 0;
  const availableWidth =
    rowWidth - ACTIVE_STATUS_HORIZONTAL_PADDING_WIDTH - activeHintWidth - activeSpacerWidth;
  if (availableWidth < STATUS_MIN_CONTEXT_WIDTH) return undefined;
  return Math.floor(availableWidth);
}

function fitStatusContextBadge(
  contextBadge: string | undefined,
  maxWidth?: number,
): string | undefined {
  if (contextBadge === undefined) return undefined;
  if (maxWidth === undefined || !Number.isFinite(maxWidth)) return contextBadge;
  if (maxWidth < STATUS_MIN_CONTEXT_WIDTH) return undefined;
  return truncateDisplay(contextBadge, Math.floor(maxWidth));
}

function fitComposerStatusParts(
  parts: InputComposerStatusParts,
  maxWidth?: number,
): InputComposerStatusParts {
  if (maxWidth === undefined || !Number.isFinite(maxWidth)) return parts;
  const width = Math.max(1, Math.floor(maxWidth));
  const separatorWidth = displayWidth(" | ");
  const modelProviderGapWidth = 1;
  const thoughtWidth = displayWidth(parts.thought);
  const modelProviderWidth =
    displayWidth(parts.model) + modelProviderGapWidth + displayWidth(parts.provider);

  if (modelProviderWidth + separatorWidth + thoughtWidth <= width) return parts;

  const modelProviderBudget = width - separatorWidth - thoughtWidth;
  if (modelProviderBudget <= 0) {
    return {
      model: "",
      provider: "",
      thought: truncateDisplay(parts.thought, width),
    };
  }

  if (modelProviderBudget <= modelProviderGapWidth) {
    return {
      ...parts,
      model: truncateDisplay(parts.model, modelProviderBudget),
      provider: "",
    };
  }

  const providerBudget = Math.min(
    displayWidth(parts.provider),
    Math.max(1, Math.floor(modelProviderBudget * 0.4)),
  );
  const modelBudget = Math.max(1, modelProviderBudget - providerBudget - modelProviderGapWidth);

  return {
    ...parts,
    model: truncateDisplay(parts.model, modelBudget),
    provider: truncateDisplay(parts.provider, providerBudget),
  };
}

function normalizeComposerStatusContentWidth(contentWidth?: number): number {
  if (contentWidth === undefined || !Number.isFinite(contentWidth)) {
    return COMPOSER_STATUS_FALLBACK_WIDTH;
  }
  return Math.max(COMPOSER_STATUS_MIN_CONTENT_WIDTH, Math.floor(contentWidth));
}

function formatCompactTokenCount(value: number): string {
  if (value < TOKEN_COUNT_KILO) return String(Math.round(value));
  if (value < TOKEN_COUNT_MEGA) return `${formatCompactDecimal(value / TOKEN_COUNT_KILO)}K`;
  return `${formatCompactDecimal(value / TOKEN_COUNT_MEGA)}M`;
}

function formatCompactDecimal(value: number): string {
  return value.toFixed(TOKEN_COUNT_DECIMAL_PLACES).replace(/\.0$/u, "");
}

function formatComposerPercent(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return `${Math.round(value * 100)}%`;
}

function validContextTokenCount(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

function validContextWindow(value: number | undefined): value is number {
  return validContextTokenCount(value) && value > 0;
}

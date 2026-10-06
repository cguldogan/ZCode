import React from "react";
import { selectedSlashCommand } from "./app-input.js";
import { modelOptionValue } from "./app-model-ref.js";
import type { SlashCommand, SlashSelectionState } from "./app-model.js";
import type { TuiEffortOption, TuiModeOption, TuiModelOption } from "./types.js";

export function resolveComposerSubmittedText({
  effortOption,
  modeOption,
  modelOption,
  slashCommands,
  slashSelection,
  submittedValue,
}: {
  effortOption?: TuiEffortOption;
  modeOption?: TuiModeOption;
  modelOption?: TuiModelOption;
  slashCommands: readonly SlashCommand[];
  slashSelection?: SlashSelectionState;
  submittedValue: string;
}): string {
  const slashCommand = selectedSlashCommand(submittedValue, slashSelection, slashCommands);
  if (modelOption) return `/model ${modelOptionValue(modelOption)}`;
  if (effortOption) return `/effort ${effortOption.id}`;
  if (modeOption) return `/mode ${modeOption.id}`;
  if (slashCommand) return `/${slashCommand.name}`;
  return submittedValue;
}

type OptionSelector<T> = { selectedOption: (submittedValue: string) => T | undefined };

/** Model, effort and mode pickers take precedence over slash autocomplete, in that order. */
export function useComposerSubmittedTextResolver({
  effortCommand,
  modeCommand,
  modelCommand,
  slashCommands,
  slashSelection,
}: {
  effortCommand: OptionSelector<TuiEffortOption>;
  modeCommand: OptionSelector<TuiModeOption>;
  modelCommand: OptionSelector<TuiModelOption>;
  slashCommands: readonly SlashCommand[];
  slashSelection?: SlashSelectionState;
}): (submittedValue: string) => string {
  return React.useCallback(
    (submittedValue: string) => {
      const modelOption = modelCommand.selectedOption(submittedValue);
      const effortOption = modelOption ? undefined : effortCommand.selectedOption(submittedValue);
      return resolveComposerSubmittedText({
        effortOption,
        modeOption:
          modelOption || effortOption ? undefined : modeCommand.selectedOption(submittedValue),
        modelOption,
        slashCommands,
        slashSelection,
        submittedValue,
      });
    },
    [effortCommand, modeCommand, modelCommand, slashCommands, slashSelection],
  );
}

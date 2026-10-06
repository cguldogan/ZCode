import {
  BUILTIN_ZCODE_SLASH_COMMAND_HELP_ENTRIES,
  type BuiltinZCodeSlashCommandHelpEntry as SlashCommandHelpEntry,
} from "@zcode/shared";

export type { SlashCommandHelpEntry };

// TUI-only: the TUI intercepts /exit before it reaches the command center, so it is not part of
// the shared protocol list that Desktop also consumes.
const TUI_EXIT_HELP_ENTRY: SlashCommandHelpEntry = {
  aliases: ["quit"],
  details: ["Aborts the active turn, if any, and closes the terminal UI."],
  name: "exit",
  summary: "Exit the terminal UI.",
  usage: "/exit",
};

export const SLASH_COMMAND_HELP_ENTRIES: readonly SlashCommandHelpEntry[] = [
  ...BUILTIN_ZCODE_SLASH_COMMAND_HELP_ENTRIES,
  TUI_EXIT_HELP_ENTRY,
];

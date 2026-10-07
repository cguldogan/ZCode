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

// CLI-only commands (specs/tui/diff-review-undo.md). Kept out of the shared protocol list so the
// desktop composer does not advertise them.
const CLI_REVIEW_UNDO_HELP_ENTRIES: readonly SlashCommandHelpEntry[] = [
  {
    details: [
      "Opens a read-only view of every uncommitted change in the workspace's git repository",
      "(working tree and index vs HEAD, untracked files as additions).",
      "Up/Down or j/k move, Enter opens a file's diff, Esc goes back or closes, r reloads.",
      "With --prompt, prints a text summary of the changed files instead.",
    ],
    name: "review",
    summary: "Review uncommitted changes with syntax-highlighted diffs.",
    usage: "/review",
  },
  {
    details: [
      "Reverts the workspace file changes made by the most recent agent turn (Edit/Write tools).",
      "Refuses without writing anything if any of those files changed since the turn.",
      "Repeat to walk back further. The conversation itself is not rewound.",
    ],
    name: "undo",
    summary: "Undo the file changes of the last agent turn.",
    usage: "/undo",
  },
  {
    details: [
      "Re-applies the file changes most recently reverted by /undo.",
      "Unavailable once a new agent turn has run after the /undo.",
    ],
    name: "redo",
    summary: "Re-apply the file changes reverted by /undo.",
    usage: "/redo",
  },
];

export const SLASH_COMMAND_HELP_ENTRIES: readonly SlashCommandHelpEntry[] = [
  ...BUILTIN_ZCODE_SLASH_COMMAND_HELP_ENTRIES,
  ...CLI_REVIEW_UNDO_HELP_ENTRIES,
  TUI_EXIT_HELP_ENTRY,
];

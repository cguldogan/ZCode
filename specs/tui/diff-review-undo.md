# TUI: `/review`, `/undo` / `/redo`, and diff layout setting

Status: accepted · Scope: `apps/zcode-cli/packages/{cli,tui,core,bootstrap,adapters,contracts,i18n}`
· Owners: see each section · Inspired by OpenCode's `/review`, `/undo`, `/redo` and `diff_style`.

Three independent features that share the existing diff renderer
(`tui/src/app-shiki-diff-view.tsx`) and the existing workspace checkpoint store.

## 1. `/review` — uncommitted changes panel

### Product rules

- `/review` (no arguments) opens a full-screen, read-only review view in the TUI listing every
  uncommitted change in the **git repository that contains the workspace directory**:
  working tree + index compared with `HEAD`. On an unborn branch (no commits yet) the base is
  the empty tree, so every tracked file shows as added.
- Untracked, non-ignored files (`git ls-files --others --exclude-standard`) are listed as
  additions (status `?`), with every line counted as added.
- Each row shows a status letter (`M` modified, `A` added, `D` deleted, `R` renamed,
  `C` copied, `T` type change, `U` unmerged, `?` untracked), the path (`old -> new` for renames),
  and `+added -deleted` line counts. Binary files show `bin` instead of counts.
- Keyboard (keyboard first, everything reachable without a mouse):

  | View | Keys | Action |
  | ---- | ---- | ------ |
  | list | `↑`/`k`, `↓`/`j` | move selection |
  | list | `PgUp`/`PgDn`, `Home`/`g`, `End`/`G` | jump |
  | list | `Enter`, `→`, `l` | open the selected file's diff |
  | list | `r` | reload the change list |
  | list | `Esc`, `q` | close the review view |
  | diff | `↑`/`↓`/`PgUp`/`PgDn`/`Home`/`End` | scroll (native scrollbox) |
  | diff | `j`/`k` | scroll one line |
  | diff | `n`/`]`, `p`/`[` | next / previous file |
  | diff | `r` | reload this file's diff |
  | diff | `Esc`, `←`, `h`, `Backspace`, `q` | back to the list |

- Diffs are rendered with `ShikiDiffView` (syntax highlighting, split/unified by width and by
  the `tui.diffStyle` setting, §3). Diffs are loaded lazily, one file at a time, when opened.
- `/review` is read-only, so it opens even while the agent is working. Pending approvals are
  not lost: the review view shows a notice and `Esc` returns to the main view where the approval
  panel takes the keyboard again.
- Graceful states, each a distinct structured result (never parsed from error text):
  - not inside a git work tree → "Not a git repository: <dir>";
  - `git` not installed / not spawnable → "git is not available";
  - git failed or timed out → message with the git exit status (stderr is not shown verbatim);
  - no changes → "No uncommitted changes.";
  - binary file → "Binary file; no text diff.";
  - mode-only/empty change → "No textual changes (mode or metadata only).";
  - large diff → only the first `REVIEW_DIFF_MAX_LINES` (2000) rows / `REVIEW_DIFF_MAX_BYTES`
    (1 MiB) of git output are shown, followed by a truncation notice;
  - more than `REVIEW_MAX_FILES` (1000) changed files → the list is cut with a notice.
- A user custom command named `review` is shadowed by the built-in in the TUI.

### Prompt mode

`zcode -p "/review"` prints a plain-text summary (same file list and counts, no diffs) and
exits 0 without creating a session or calling a model; "not a git repo"/"git unavailable"
print a message to stderr and exit 1. This keeps CI/script use meaningful while the
interactive diff browsing stays TUI-only.

### Ownership and I/O

```text
TUI (transient UI state only)                 CLI adapter (all I/O)
  /review typed ──► useReviewPanel.open() ──► workspaceReview.listChanges()
                     state: loading            git rev-parse / diff --name-status -z
                     ◄── TuiReviewListResult    git diff --numstat -z / ls-files --others
  Enter ───────────► requestId++ ───────────► workspaceReview.loadFileDiff(file)
                     ◄── TuiReviewFileDiff      git diff <base> -- <path>  | fs read (untracked)
  stale result (requestId mismatch) ──► dropped
```

- `cli/src/workspace-review/*` owns git execution and parsing. Every git call uses
  `child_process.spawn` with an argument array (no shell), `cwd` = repo root,
  `--literal-pathspecs`, `--no-color --no-ext-diff --no-textconv`, `GIT_OPTIONAL_LOCKS=0`,
  a 10 s timeout and an output byte cap. Untracked files are read with async `fs/promises`.
- `tui/src/app-review-*.ts(x)` owns only transient view state (selection, open file, loading
  flags, request id). It reaches git only through the injected `TuiOptions.workspaceReview`
  provider. Stale-result rule: every list/diff load carries a monotonically increasing request
  id; results whose id is not the latest are discarded.

## 2. `/undo` and `/redo`

### Owner

The core session runtime (`core/src/runtime/methods/turn-undo.ts`). Undo/redo reuse the
**existing** workspace checkpoints (`CheckpointCreated` events + `workspace_file_before_change`
artifacts written for every file-mutating tool call) and the existing journaled
file-summary rewind (`applyWorkspaceFileRewind`). No second snapshot store is introduced.
The TUI only sends `/undo` / `/redo` and displays the response.

### Definitions

- **Agent turn with file changes**: a runtime turn (`turnId`) that produced at least one
  workspace-scope `CheckpointCreated` event. Only file-editing tools (Edit/Write/ApplyPatch…)
  produce checkpoints; changes made through shell commands are **not** captured and cannot be
  undone (same limitation as `/rewind`).
- **Undo record**: `RewindTriggered { scope: "workspace", reason: "file_summary_rewind" }` — the
  same event the desktop's per-turn "revert files" writes. **Redo record**:
  `RewindTriggered { scope: "workspace", reason: "turn_redo" }`. Both carry the target turn's
  checkpoint id in `targetCheckpointId`, are persisted as session entries and restored on resume.
- Undo/redo state is **derived** from the session event log (`deriveTurnUndoState`), never
  stored separately.

### Semantics

1. `/undo` targets the most recent agent turn with file changes whose changes are currently
   applied. Repeating `/undo` walks back one turn at a time.
2. Before writing anything, every file of the target turn is checked: its current content
   (SHA-256) must equal the content the turn left behind (last after-state of that file in the
   turn). If **any** file differs (the user or a later process edited it), the whole undo is
   **refused**, nothing is written, and the conflicting files are listed. Rationale: silently
   overwriting user edits is unrecoverable; refusing is always safe and the user can resolve
   manually or use `/rewind`.
3. Files that resolve outside the workspace root are refused the same way (never touched).
4. Writes are journaled; if a write fails mid-way, already-written files are restored and the
   undo reports failure (existing `applyWorkspaceFileRewind` behavior).
5. On success the turn's files are back to their content before the turn (files the turn
   created are deleted), a model-only notice is recorded so the next agent turn knows the files
   changed, and the response lists the files and says `/redo` can re-apply them.
6. `/redo` re-applies the most recently undone turn (LIFO). Each file's current content must
   equal the turn's **before**-state (i.e. what `/undo` restored); otherwise the redo is refused
   with the same all-or-nothing rule. Success writes the turn's final after-state.
7. The redo stack is cleared (redo becomes unavailable; undone turns stay undone) when, after
   the undo:
   - a new agent turn starts (`TurnStarted` carrying a user `messageId`, not `controlOnly`), or
   - a model step completes (`lastAssistantCompletedAtMs` later than the undo — this signal is
     restored on resume, so it also covers turns that ran before a restart), or
   - a new turn creates checkpoints, or
   - any other applied rewind (`/rewind`, conversation rewind) happens.
8. Nothing to undo / nothing to redo → a clear message; no files written, no rewind event.
9. The conversation is **not** rewound (unlike OpenCode). Use `/rewind` for that.
10. While the agent is working, `/undo` and `/redo` are refused with a message instead of
    being steered into the running turn ("wait or press Esc first").
11. `zcode -p "/undo"` (with `-c`/`--resume` to address an existing session) runs the same
    runtime command and prints the response.

### Event order

```text
/undo ─► TurnStarted(input "/undo", no messageId)
       ─► plan (read checkpoints, hash-check files) ── conflict ─► TurnComplete(refusal text)
       ─► journaled writes ─► RewindTriggered(file_summary_rewind) ─► persisted entry
       ─► model-only notice ─► TurnComplete(response)
/redo ─► same shape with RewindTriggered(turn_redo)
agent turn ─► TurnStarted(messageId) ─► … model step completes  ⇒ redo stack cleared
```

## 3. Diff layout setting `tui.diffStyle`

- Config key `tui.diffStyle` in the CLI config files (`~/.zcode/cli/config.json`, project
  config): `"auto"` (default; split side-by-side when the content width is > 120 columns,
  unified otherwise — the existing behavior) or `"stacked"` (always unified).
- Validation: any other value (wrong string, wrong type) falls back to `"auto"` and emits a
  `config_value_invalid` warning diagnostic; it never invalidates the rest of the config file.
- Owner: `contracts` (`TUI_DIFF_STYLES`, `normalizeTuiDiffStyle`) → `adapters` config store →
  bootstrap `app.getDiffStyle()` → CLI TUI startup metadata → `TuiOptions.diffStyle` →
  React context read by `ShikiDiffView`. Applies to tool-call diffs, subagent transcripts and
  the `/review` view. Read at TUI start; changing the file takes effect on the next start.

## Acceptance scenarios

1. Temp repo with a modified, a staged-new, a deleted, a renamed, an untracked and a binary
   file → `/review` lists all six with correct status letters and counts; Enter on the modified
   file shows a highlighted diff; Esc returns to the list; Esc closes.
2. `/review` outside a git repo → "Not a git repository"; with no changes → "No uncommitted
   changes."
3. A 50 000-line change → diff shows 2000 rows and a truncation notice; the TUI stays responsive.
4. Agent turn edits `a.txt` and creates `b.txt` → `/undo` restores `a.txt`, deletes `b.txt`;
   `/redo` restores both edits.
5. Agent turn edits `a.txt`; user edits `a.txt` → `/undo` refuses, lists `a.txt`, writes nothing.
6. Turns T1, T2 edit files → `/undo` twice reverts T2 then T1; `/redo` re-applies T1.
7. `/undo`, then a new prompt runs → `/redo` reports nothing to redo.
8. New session with no edits → `/undo` and `/redo` report nothing to do.
9. `tui.diffStyle: "stacked"` → tool diffs and review diffs are unified on a 160-column
   terminal; `"bogus"` → behaves as `"auto"` and logs a warning.
10. `zcode -p "/review"` prints the text summary without starting a model turn.

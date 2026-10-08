import type { ZCodeCopy } from "../types.js";

export const enUS: ZCodeCopy = {
  locale: "en-US",
  cli: {
    errors: {
      localeUnsupported: (value) =>
        `Unsupported --locale value: ${value}. Supported locales: en-US, zh-CN, auto.`,
    },
    help: (version) => `ZCode Beyond ${version} (command: zcode)

Usage:
  zcode [command] [options]

With no command, zcode opens the full-screen TUI.

Commands:
  app-server Run the ZCode Protocol stdio app server
  commands   List custom slash commands (\`commands list\`)
  doctor     Inspect runtime and packaging assumptions
  plugins    Manage plugins and marketplaces (\`plugins list|install|uninstall|enable|disable|update|validate|marketplace ...\`; alias: plugin)
  skills     List local skills (\`skills list\`)
  update     Check GitHub for a newer ZCode Beyond build (report only, never downloads)
  tui        Open the terminal UI
  version    Print the CLI version

Options:
  -h, --help       Show help
  -v, --version    Show version
  -p, --prompt <text>  Run a single prompt without opening the TUI
  --enable-workflow  Enable dynamic workflows for --prompt or --target (default: off)
  --memory-bench   With --prompt, enable automatic Memory extraction and wait before exiting (requires Memory enabled)
  --browser-use <mode> Enable Browser Use backend (supported: headless)
  --surface <surface>  Presentation surface for headless prompts/app-server: terminal or desktop
  --browser-executable <path> Chrome/Chromium executable for headless Browser Use
  --attach <path>  Attach a local file to --prompt; repeat for multiple files
  --cwd <path>     Run this command from the given directory
  --disallowed-tools, --disallowedTools <tools...>
    Remove whole tools for this prompt/TUI run only; saved settings are unchanged.
    Comma or space-separated tool names, e.g. "Bash Edit".
    "Bash(git *)" removes all of Bash; command patterns are not matched.
  --force-mcs      Force mid-conversation system projection for Anthropic providers
  --locale <locale>  UI locale: en-US, zh-CN, or auto
  --mode <mode>    Permission mode for prompts: build, edit, plan, or yolo (default: yolo for --prompt)
  --resume <sessionId>  Resume a persisted session by sessionId (sess_...)
  --target <text>  Run or set the session goal in headless mode
  --target-replace Replace any existing session goal set by --target
  -c, --continue        Resume the latest session for the current directory
  --json           Print machine-readable JSON where supported
  --no-browser     Print the OAuth URL without opening a browser
  --no-color       Disable ANSI colors
  --verbose        Print extra diagnostic detail

Slash Commands:
  /help [command]       Show slash command help
  /compact [instructions]  Compact the current conversation
  /expert [status|resume|stop|<task>]  Run or manage the expert workflow
  /dwf [list|cancel|resume]  List, cancel, or resume dynamic workflow runs
  /fork [latest|checkpointId]  Fork a new session from a workspace checkpoint
  /mcp [list|status|enable|disable|connect|disconnect]  Open the MCP manager (TUI) or manage MCP servers
  /mode [mode]          Show or switch permission mode: build, edit, plan, or yolo
  /model [id]           Show or switch the current session model
  /new                  Start a fresh session in the TUI
  /resume [sessionId]   Resume a session by sessionId; omit it for latest in cwd
  /rewind [latest|checkpointId]  Show latest checkpoint or restore workspace files
  /review               Review uncommitted changes with highlighted diffs (TUI view; text summary with -p)
  /undo                 Undo the file changes of the last agent turn
  /redo                 Re-apply the file changes reverted by /undo
  /skill [name] [task]  List skills, or force the next prompt to load one
  /goal [action]        Show or set the current session goal
`,
  },
  tui: {
    copy: {
      copied: "Copied selected text to clipboard.",
      failed: "Could not copy selected text.",
      unavailable: "Text clipboard copy is not available in this terminal.",
    },
    effort: {
      disabled: "disabled",
      enabled: "enabled",
    },
    input: {
      activeStatusHint: "esc to interrupt",
      busyPlaceholder: "Type to queue input",
      placeholder: "Type a prompt",
      queuedMore: (count) => `+ ${count} more queued`,
      queuedSubmitHint: "Submitted after the next tool call.",
      queuedTitle: (count) => ` Queue (${count}) `,
      title: "Input",
      noHistorySource: "No input history source is configured.",
      noPreviousInput: "No previous input for this project.",
      restoredPreviousInput: "Restored previous input.",
      restoredPreviousInputWithAttachments: (count) =>
        `Restored previous input with ${count} attachment(s).`,
      restorePreviousInputFailed: "Could not restore previous input.",
      typePrompt: "Type a question and press Enter.",
    },
    loginRequired: {
      help: "Use /model to view models, or add a local provider such as LiteLLM in the desktop app (Settings → Model settings).",
      message: "No available models. Configure a local provider such as LiteLLM.",
      status: "No available models. Configure a local provider such as LiteLLM.",
      title: "model setup required",
    },
    loginSetup: {
      emptyMessage: "No login options are available.",
      help: "Use Up/Down to choose, Enter to select.",
      options: {
        bigmodelApiKey: {
          inputPrimary: "Enter BigModel Coding Plan API Key",
          inputSecondary: "Paste the key here. It is hidden while typing.",
          primary: "BigModel Coding Plan API Key",
          secondary: "Paste a Coding Plan API key manually.",
        },
        bigmodelOauth: {
          pendingPrimary: "Waiting for BigModel authorization",
          pendingSecondary:
            "Complete sign-in in your browser. Authorization is detected automatically.",
          primary: "BigModel Coding Plan",
          secondary: "Open browser login; authorization is detected automatically.",
        },
        zaiApiKey: {
          inputPrimary: "Enter Z.AI Coding Plan API Key",
          inputSecondary: "Paste the key here. It is hidden while typing.",
          primary: "Z.AI Coding Plan API Key",
          secondary: "Paste a Coding Plan API key manually.",
        },
        zaiOauth: {
          pendingPrimary: "Waiting for Z.AI authorization",
          pendingSecondary:
            "Complete sign-in in your browser. I will continue when authorization finishes.",
          primary: "Z.AI Coding Plan",
          secondary: "Open browser login and create a Coding Plan API key.",
        },
      },
      pending: {
        cancelStatus: "Login cancelled. Choose a setup method.",
        help: "Esc cancels and returns to setup choices.",
        status: "Waiting for browser authorization...",
      },
      input: {
        cancelStatus: "API key entry cancelled. Choose a setup method.",
        clearStatus: "API key input cleared.",
        emptyStatus: "API key is required.",
        help: "Enter saves the key. Esc returns to setup choices.",
        placeholder: "Paste API key",
        status: "Enter the API key, then press Enter.",
        submitStatus: "Saving API key...",
      },
      prompt: "Choose a login or API key setup method.",
      response: "Choose how to set up a Coding Plan provider.",
      title: "Set Up Coding Plan",
    },
    model: {
      requestFailed: (message) => `Model request failed: ${message}`,
      responseReceived: "Model response received.",
      responseReceivedWithTokens: (tokens) => `Model response received. ${tokens} tokens.`,
      retryScheduled: ({ attempt, delay, maxAttempts, reason }) =>
        `Retrying model request ${attempt}/${Math.max(1, maxAttempts - 1)} in ${delay}: ${reason}`,
      streamStalled: "Model stream stalled.",
    },
    sidebar: {
      subagents: {
        title: "Subagents",
        empty: "No subagents yet.",
        emptyOutput: "No output yet.",
        back: "← Main conversation",
        readonly: "Read-only · Esc to return",
        loading: "Loading subagent output...",
        unavailable: "Subagent output unavailable.",
        retry: "Retry",
        more: "Load more",
        pendingMain: "Main conversation needs your input — return to respond",
        ended: (count) => `Ended (${count})`,
        status: {
          running: "running",
          waiting: "waiting",
          blocked: "blocked",
          success: "completed",
          failed: "failed",
          cancelled: "cancelled",
          lost: "lost",
        },
      },
      api: {
        empty: "No API calls yet.",
        model: "Model",
        more: (count) => `+${count} more`,
        requests: "Requests",
        server: "Server",
      },
      cache: {
        hit: "hit",
        lastHit: "last hit",
        lastMiss: "last miss",
        readWrite: ({ read, write }) => `${read} read / ${write} write`,
        total: "total",
      },
      context: {
        cache: "Cache",
        cacheReadWrite: "Cache R/W",
        inputOutput: "I/O",
        reason: "Reason",
        tokens: "Tokens",
        used: "Used",
        window: "Window",
      },
      modifiedFiles: {
        empty: "No file changes yet.",
        more: (count) => `+${count} more`,
      },
      mcp: {
        empty: "No MCP servers configured.",
        loadFailed: "MCP status unavailable.",
        loading: "Loading MCP status...",
        more: (count) => `+${count} more`,
        servers: "Servers",
        status: {
          connected: "connected",
          connecting: "connecting",
          disabled: "disabled",
          disconnected: "disconnected",
          failed: "failed",
          untrusted: "untrusted",
        },
        summary: ({ connected, total }) => `${connected}/${total} connected`,
        tools: (count) => `${count} ${count === 1 ? "tool" : "tools"}`,
        disabledCount: (count) => `${count} disabled`,
        hint: "/mcp to manage",
      },
      request: {
        complete: "complete",
        error: "error",
        errorWithStatus: (statusCode) => `error ${statusCode}`,
        pending: "pending",
      },
      status: {
        last: "Last",
      },
      run: {
        draft: "Draft",
        draftChars: (count) => `${count} chars`,
        draftEmpty: "empty",
        messages: "Messages",
        mode: "Mode",
        model: "Model",
        provider: "Provider",
        thought: "Thought",
        trace: "Trace",
        turn: "Turn",
        workspace: "Workspace",
      },
      sections: {
        apis: "APIs",
        context: "Context",
        mcp: "MCP",
        modifiedFiles: "Modified Files",
        run: "Run",
        status: "Status",
        todos: "Todos",
      },
      shellSubtitle: "OpenTUI shell",
      title: "Sidebar",
      todos: {
        empty: "No todos yet.",
        more: (count) => `+${count} more`,
        progress: "Progress",
      },
    },
    status: {
      compactFailed: "Context compression failed.",
      compacted: "Conversation compacted.",
      compacting: "Compressing context...",
      interruptedStreamDiscarded: "Interrupted model stream discarded.",
      modelCalling: "Calling model...",
      permissionRequested: (toolName) => `Permission requested for ${toolName}.`,
      permissionResolved: (toolName) => `Permission resolved for ${toolName}.`,
      ready: "Ready.",
      recoveringStream: "Recovering interrupted model stream...",
      retryingStream: "Retrying model stream...",
      sessionResumed: "Session resumed.",
      targetChanged: (action) => `Target ${action}.`,
      thinking: "Thinking...",
      toolCompleted: (toolName) => `Tool ${toolName} completed.`,
      toolFailed: (toolName) => `Tool ${toolName} failed.`,
      toolPending: (toolName) => `Tool ${toolName} pending.`,
      toolRunning: (toolName) => `Tool ${toolName} running.`,
      turnFailed: "Turn failed.",
    },
    terminal: {
      requiresInteractive: "TUI requires an interactive terminal.",
      starting: "Starting ZCode... Ctrl+C to exit",
    },
    transcript: {
      compact: {
        completed: "Context compressed",
        failed: "Context compression failed",
        interrupted: "Context compression interrupted",
        retry: (command) => `Ctrl-R to retry ${command}`,
        retrying: ({ attempt, maxAttempts }) =>
          maxAttempts > 0
            ? `Retrying context compression (${attempt}/${maxAttempts})`
            : "Retrying context compression",
        skipped: "Context is up to date; no compression needed",
        started: "Compressing context",
      },
      roles: {
        agent: "Agent",
        system: "System",
        user: "User",
      },
      thought: {
        complete: "Thought",
        thinking: "Thinking...",
      },
      title: "Transcript",
      workflow: {
        actors: "actors:",
        actorRow: ({ name, status }) => `${name} - ${status}`,
        usage: ({ spentTokens }) => `usage: ${spentTokens} tokens`,
        collapsed: ({ label, status, nodesSettled, nodesTotal }) =>
          `Workflow ${label} - ${status} (${nodesSettled}/${nodesTotal} steps)`,
        error: (message) => `error: ${message}`,
        expandHint: "+ to expand",
        collapseHint: "- to collapse",
        log: "log:",
        nodes: ({ nodesSettled, nodesTotal }) => `${nodesSettled}/${nodesTotal} steps settled`,
        result: (preview) => `result: ${preview}`,
        status: {
          completed: "completed",
          errored: "errored",
          pending: "pending",
          running: "running",
          stopped: "stopped",
        },
        stopReason: {
          user: "by you",
          model: "by the agent",
          provider: "model error",
          interrupted: "process exited",
          superseded: "superseded by an amended run",
        },
        truncated: "(truncated - full history in the run journal)",
        interruptedNotice: ({ label, runId }) =>
          `Workflow ${label} was interrupted and can be resumed: /dwf resume ${runId}`,
      },
    },
    selection: {
      defaultHelp: "Enter selects, Esc cancels",
      disabled: (reason) => ` [disabled: ${reason}]`,
      filterLine: ({ filter, help }) =>
        `filter: ${filter || "-"} | ${help ?? "Enter selects, Esc cancels"}`,
      noFilter: "-",
    },
    fileMention: {
      empty: "No matching workspace paths.",
      loading: "Loading workspace paths...",
      row: ({ path, selected }) => `${selected ? ">" : " "} ${path}`,
      title: "Files",
    },
    slash: {
      title: "Commands",
      row: ({ name, selected, summary }) => `${selected ? ">" : " "} /${name}  ${summary}`,
    },
    review: {
      title: " Review ",
      loading: "Loading uncommitted changes...",
      loadingDiff: "Loading diff...",
      summary: ({ additions, deletions, files }) =>
        `${files} file${files === 1 ? "" : "s"} changed  +${additions} -${deletions}`,
      listHelp: "Up/Down or j/k move · Enter open · r reload · Esc close",
      diffHelp: "Up/Down/PgUp/PgDn or j/k scroll · n/p next/previous file · Esc back",
      empty: "No uncommitted changes.",
      listTruncated: "File list truncated.",
      binary: "Binary file; no text diff.",
      noTextChanges: "No textual changes (mode or metadata only).",
      diffTruncated: "Diff truncated; only the beginning is shown.",
      notGitRepo: (directory) => `Not a git repository: ${directory}`,
      gitUnavailable: "git is not available on PATH.",
      gitFailed: ({ exitCode, timedOut }) =>
        timedOut
          ? "git timed out while reading changes."
          : `git failed while reading changes${exitCode === undefined ? "" : ` (exit code ${exitCode})`}.`,
      pendingApproval: "An approval request is waiting. Press Esc to return to it.",
      unavailable: "/review is not available in this client.",
      closed: "Review closed.",
    },
    mcp: {
      title: " MCP ",
      listHelp: "Up/Down move · Space toggle · r reconnect · t tools · R refresh · Esc close",
      header: ({ connected, disabled, enabled }) =>
        `${connected}/${enabled} connected${disabled > 0 ? `, ${disabled} disabled` : ""}`,
      loading: "Loading MCP servers...",
      empty: "No MCP servers configured.",
      loadFailed: "MCP status unavailable. Press R to retry.",
      unavailable: "The MCP manager is not available in this client.",
      closed: "MCP manager closed.",
      pendingApproval: "An approval request is waiting. Press Esc to return to it.",
      working: "working...",
      noTools: "no tools",
      toolsHeading: (count) => `${count} ${count === 1 ? "tool" : "tools"}:`,
      status: {
        connected: "connected",
        connecting: "connecting",
        disabled: "disabled",
        disconnected: "disconnected",
        failed: "failed",
        needsAuth: "needs auth",
        untrusted: "untrusted",
      },
      origin: {
        builtin: "built-in",
        cli: "cli",
        env: "env",
        host: "host",
        plugin: "plugin",
        project: "project",
        system: "system",
        user: "user",
      },
      notice: {
        disabled: (name) => `${name} disabled; its tools were removed from this session.`,
        enabled: (name) => `${name} enabled.`,
        failed: ({ message, name }) => `${name}: ${message}`,
        needsEnabled: (name) => `${name} is disabled; enable it first (Space).`,
        readOnlyBuiltin: ({ name, plugins }) =>
          `${name} is provided by ${plugins || "a plugin"}; manage it with /plugins disable <id>.`,
        readOnlyOther: ({ name, origin }) =>
          `${name} comes from ${origin} configuration and cannot be toggled here.`,
        readOnlyPlugin: ({ name, plugins }) =>
          `${name} is provided by plugin ${plugins || "(unknown)"}; manage it with /plugins.`,
        reconnected: (name) => `${name} reconnected.`,
      },
    },
  },
};

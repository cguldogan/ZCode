# TUI: MCP manager panel and enable/disable

Status: accepted · Scope: `apps/zcode-cli/packages/{tui,cli,bootstrap,core,adapters,i18n}`,
`packages/shared/src/mcp.ts`, `packages/services/src/mcp-sync/mcpSyncService.ts`

The TUI sidebar MCP block only showed `Servers 1/1 connected` and one row per server. Users
could not switch a server off without editing JSON, and failures were hard to read. This spec
adds an interactive MCP manager (`/mcp`), persistent enable/disable that the desktop app and the
CLI agree on, and a more informative sidebar block.

## 1. Product rules

- `/mcp` with no arguments opens a full-screen MCP manager view in the TUI (like `/review`, it
  replaces the transcript and composer until closed). `/mcp list|status|connect|disconnect` keep
  their text behavior; `/mcp enable <server>` and `/mcp disable <server>` are new text forms of
  the toggle (scripts and `-p` mode).
- Every server the session knows is listed, sorted by name, with:
  - status: `connected`, `connecting`, `needs auth` (connecting with a pending OAuth
    authorization URL), `failed`, `disconnected`, `disabled`, `untrusted`;
  - transport: `stdio`, `http`, `sse`;
  - origin: `user` (`~/.zcode/cli/config.json`), `project` (a workspace `.zcode/config.json`),
    `plugin` (namespaced `plugin:<name>:<key>` from a loaded plugin), `built-in` (host
    `node_repl`), `env`/`cli`/`system` (config layers that are not files), `host` (servers handed
    in by a desktop/protocol host);
  - tool count, and for failed servers the error message (truncated to the row; the full text is
    shown in the detail line of the selected row).
- **Enable/disable** (Space or Enter on a row):
  - Only file-backed servers (`user`, `project`) can be toggled. The toggle writes the server's
    own `enabled` field in the file that defines it (see §2) and then applies the new state to
    the running session: disabling closes the connection and removes the server's tools from
    the model-visible tool set; enabling connects and registers its tools.
  - Other origins are read-only in this panel; the row shows why (`plugin`/`built-in` → manage
    the owning plugin with `/plugins`; `env`/`cli`/`system`/`host` → owned elsewhere). Pressing
    Space on them only shows that reason. The built-in `node_repl` is owned by the official
    Browser Use / Computer Use plugins' enablement (`plugins.enabledPlugins`); it is not given a
    second, MCP-level enabled flag.
  - The state persists: a server disabled in the TUI is still disabled after restart, in new
    sessions, and in the desktop settings page (same field, same file).
- **Reconnect** (`r`): re-runs the connection for an enabled server of any origin (closes and
  reopens; tools are re-listed and re-registered). Not offered for disabled servers.
- **Tools** (`t`, `→`, `l`): expands/collapses the selected server's tool names (`+` collapsed,
  `-` expanded, per CLI AGENTS.md).
- `Esc`/`q` closes the view. Pending approvals: like `/review`, a notice is shown and `Esc`
  returns to the approval panel.
- Toggling/reconnecting while a turn is running is allowed. The registry change applies to the
  next model request; a call already in flight against a server being disabled fails with the
  adapter's normal "not connected" tool error.
- Sidebar block (compact, fixed sidebar width): summary `connected/enabled` plus a `disabled`
  count when non-zero; one row per server (up to 5) with status, name, transport and tool count;
  disabled rows are dimmed; failed rows get one extra truncated reason line; the block ends
  with the hint `/mcp to manage`.

## 2. State owners

| State | Single owner | Others |
| ----- | ------------ | ------ |
| Persisted enabled flag | The server entry's `enabled` field in the config file that defines it: `mcp.servers.<name>.enabled` in `~/.zcode/cli/config.json` (user) or `<dir>/.zcode/config.json` (project). Absent/`true` = enabled, `false` = disabled. | Desktop settings (`mcpSyncService` `set-enabled`) and the CLI (`updateMcpServerEnabledInFileConfig`) both write it through the one pure helper `setMcpServerConfigEnabled` in `@zcode/shared/mcp`; readers use `isMcpServerConfigEnabled`/the config schema. |
| Live connection status and tools | `McpPort` records (adapter). A disabled server has a `disabled` record and no client; `callTool` cannot revive it (unlike `disconnected`, which reconnects on demand). | `listMcpServers`/`listMcpServerEntries` project port status; config only fills servers without a record. |
| Model-visible MCP tools | Runtime `ToolRegistry`, projected from the port's descriptors. | `AgentRuntime.applyMcpServerState` resyncs one server's entries. |
| Server origin and config path | Resolved once per app in bootstrap (`resolveMcpServerOrigins`) from config sources (`ConfigResult.sources.mcp.serverSources/serverPaths`), plugin and built-in maps. | Read-only. |
| Panel selection, expanded rows, pending action, last action message | TUI (`app-mcp-state.ts`, transient). | Never persisted; never treated as server truth. |

No second enabled list is introduced anywhere.

## 3. Interfaces

Bootstrap `ZCodeApp` (owned by `bootstrap/src/app/mcp-facade.ts`, which also takes over
`listMcpServers`/`connectMcpServer`/`disconnectMcpServer` from the session facade):

```ts
type ZCodeMcpServerOrigin = "user" | "project" | "plugin" | "builtin" | "env" | "cli" | "system" | "host";
interface ZCodeMcpServerEntry {
  name: string;
  status: McpServerStatus;        // contracts type; status "disabled" when off
  origin: ZCodeMcpServerOrigin;
  configPath?: string;            // user/project only
  toggleable: boolean;            // origin is user|project and the session has an MCP port
  toolNames: string[];            // from McpPort.listTools() for this server
}
type ZCodeMcpServerActionResult =
  | { ok: true; entry: ZCodeMcpServerEntry }
  | { ok: false; code: "not_configured" | "read_only" | "mcp_unavailable" | "persist_failed"; message: string };
listMcpServerEntries(): Promise<ZCodeMcpServerEntry[]>;
setMcpServerEnabled(name: string, enabled: boolean): Promise<ZCodeMcpServerActionResult>;
reconnectMcpServer(name: string): Promise<ZCodeMcpServerActionResult>;
```

A connection failure after a successful persist is **not** an action error: the result is
`ok: true` with `status.status === "failed"` and `status.error`; the persisted intent stays.

Core `AgentRuntime.applyMcpServerState({ name, enabled?, traceContext })`: waits for MCP startup
registration, reconnects (or disables) the one server through `McpPort.connectServer` with its
session config (`enabled` overridden when given, also stored back into the runtime's MCP
config), unregisters that server's tool entries (`metadata.mcpPresentation.serverName`),
registers its current descriptors with the session's allow/deny lists, and invalidates the tool
cache. `initializeMcp` becomes single-flight so a toggle during startup cannot double-register.

Adapters: `updateMcpServerEnabledInFileConfig(filePath, name, enabled)` patches only that
server object (atomic temp-file rename, mode 0600) and fails with a typed error when the file
no longer defines the server. `ConfigResult.sources.mcp.serverPaths` records the defining file
for `user`/`project` servers (the last project file defining the name wins, matching the merge).

TUI: `TuiOptions.mcpManager?: { list(); setEnabled(name, enabled); reconnect(name) }` (the CLI
adapts the app methods). The sidebar and the panel read one hook (`useMcpServers`), so there is
one poller (5 s, 10 s after an error) and actions refresh it immediately.

No ZCode protocol type changes: the TUI runs the app in-process, and the desktop keeps its own
settings-page path to the same persisted field.

## 4. Event order (toggle)

```text
TUI panel            CLI adapter        McpFacade (serialized)        Config file     Runtime / McpPort
Space on row ─► pending[name]=true
              ─► setEnabled(n,false) ─► queue.then(...)
                                        origin user|project? else ─► {ok:false, read_only}
                                        persist ───────────────────► enabled:false (atomic)
                                        (persist error ─► {ok:false, persist_failed}; runtime untouched)
                                        runtime.applyMcpServerState(n, enabled:false) ──────────►
                                                                       await MCP startup + tool registration
                                                                       port.connectServer(n,{..,enabled:false}) → "disabled"
                                                                       registry: unregister n's tools; invalidate cache
                                        ◄─ status ─────────────────────────────────────────────────
                                        entry = projection(port.status, port.listTools)
              ◄─ {ok:true, entry} ◄────
pending cleared, message shown, list refreshed (poller restarts)
```

Enable is the same with `enabled:true` (the field is removed from the file), ending in
`connected` + tools registered, or `failed` + error. Actions on one facade are serialized in
admission order, so two quick toggles end in the last requested state both on disk and live.
The TUI ignores a result for a server whose pending marker was cleared by a newer action (stale
result rule: each action carries a monotonically increasing id).

## 5. Keyboard map (MCP view)

| Keys | Action |
| ---- | ------ |
| `↑`/`k`, `↓`/`j` | move selection |
| `Home`/`g`, `End`/`G` | first / last |
| `Space`, `Enter` | toggle enabled (file-backed servers), else show the read-only reason |
| `r` | reconnect the selected enabled server |
| `t`, `→`, `l` | expand/collapse tool names (`←`/`h` collapses) |
| `R` (Shift+r) | refresh the list now |
| `Esc`, `q` | close |

## 6. Acceptance scenarios

1. With a user-config stdio server `demo` connected, `/mcp` opens the view showing
   `connected  demo  stdio  user  N tools`; `t` lists its tool names.
2. Space on `demo` → row shows `disabled`, `~/.zcode/cli/config.json` has
   `mcp.servers.demo.enabled: false`, the next model request has no `mcp__demo__*` tools.
3. Space again → `enabled` key removed from the file, row returns to `connected`, tools are
   registered again.
4. Quit and relaunch after disabling → `demo` is listed as `disabled`, not connected, no tools.
5. A server whose command fails → row `failed` with the error text; `r` retries.
6. `node_repl` (built-in) → Space shows "provided by a plugin, use /plugins"; `r` reconnects.
7. The config file was edited so `demo` no longer exists → toggle returns
   `persist_failed`/`not_configured` and the live state is unchanged.
8. Narrow terminal (sidebar overlay or panel < 60 cols) → rows truncate with `…`; no wrapping.

## 7. Tests

- `tui/test/app-mcp-state.test.ts`: row view-model (status labels incl. needs-auth, counts,
  error truncation, origin labels), reducer (select, toggle, expand, reconnect gating, close,
  stale results), sidebar summary.
- `adapters/test/mcp-enabled-config.test.ts`: patch semantics, atomic write, missing server,
  reload through `createConfig` keeps the server disabled, `serverPaths`.
- `core/test/mcp-server-state.test.ts`: `applyMcpServerState` with a fake port and real registry
  (disable removes tools, enable restores them, reconnect re-lists, single-flight init).
- `cli/test/mcp-command.test.ts`: `/mcp enable|disable` text path and the TUI adapter.
- Manual: built CLI in a temp `HOME` with a tiny stdio MCP server, toggle off/on and restart.

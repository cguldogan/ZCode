import {
  getCapturedZCodeCuaBrokerCredentials,
  ZCODE_CUA_OFFICIAL_PLUGIN_ID,
  ZCODE_CUA_PLUGIN_AUTHORITY_ENV_KEY,
  ZCODE_PLUGIN_ID_ENV_KEY,
} from "@zcode/shared";
import { registerMcpTools, traceContextToLogContext } from "../deps.js";
import type {
  McpConnectionSnapshot,
  McpPort,
  McpServerConfig,
  McpServerStatus,
  McpToolDescriptor,
  TraceContext,
} from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";

const MCP_SESSION_OAUTH_AUTHORIZATION_TIMEOUT_MS = 15_000;

/**
 * 只有同时携带 resolver 注入的官方 plugin id 和本进程私有 authority 的 server 才能共享
 * Computer Use 项目授权。server 名、tool 名和 manifest env 都可被第三方仿造，不能单独作为信任依据。
 */
export function computeOfficialCuaServerNames(
  servers: Record<string, McpServerConfig>,
  trustedServerNames: ReadonlySet<string>,
): Set<string> {
  const expectedAuthority = getCapturedZCodeCuaBrokerCredentials().pluginAuthority;
  const names = new Set<string>();
  if (!expectedAuthority) return names;

  for (const [name, config] of Object.entries(servers)) {
    if (!trustedServerNames.has(name)) continue;
    if (config.type !== "stdio") continue;
    if (
      config.env?.[ZCODE_PLUGIN_ID_ENV_KEY]?.trim().toLowerCase() !==
        ZCODE_CUA_OFFICIAL_PLUGIN_ID ||
      config.env?.[ZCODE_CUA_PLUGIN_AUTHORITY_ENV_KEY]?.trim() !== expectedAuthority
    ) {
      continue;
    }
    names.add(name);
  }
  return names;
}

export function startMcpStartup(
  this: AgentRuntimeInternal,
  traceContext: TraceContext,
): Promise<McpConnectionSnapshot> | undefined {
  if (this.mcpInitialized) return this.mcpStartupPromise;
  this.mcpInitialized = true;

  if (!this.mcpPort || this.config.mcp?.enabled === false) {
    this.mcpToolsRegistered = true;
    return undefined;
  }

  const servers = this.config.mcp?.servers ?? {};
  if (Object.keys(servers).length === 0) {
    const startup = Promise.all([this.mcpPort.status(), this.mcpPort.listTools()])
      .then(([statuses, tools]) => ({ statuses, tools }))
      .catch((error) => {
        this.logger?.warn("MCP existing tool discovery failed", {
          ...traceContextToLogContext(traceContext),
          error: error instanceof Error ? error.message : String(error),
          event: "mcp.existing_tools.failed",
          module: "core.runtime",
          status: "failed",
        });
        return { statuses: {}, tools: [] };
      });
    this.mcpStartupPromise = this.trackResidencyBlockingWork(startup);
    return this.mcpStartupPromise;
  }

  const startedAt = Date.now();
  const startup = this.mcpPort
    .connectConfiguredServers(servers, {
      // authorization_code MCP 无人完成浏览器授权时，session 启动过去会等默认 5 分钟，
      // 导致模型请求迟迟不发出；session 只等 15s，授权入口由设置页 mcp/list 展示。
      oauthAuthorizationTimeoutMs: MCP_SESSION_OAUTH_AUTHORIZATION_TIMEOUT_MS,
      trace: traceContext,
      workingDirectory: this.workingDirectory,
      workspaceIdentity: this.config.workspaceIdentity?.toString(),
    })
    .then((snapshot) => {
      const statusCounts = Object.values(snapshot.statuses).reduce<Record<string, number>>(
        (counts, status) => {
          counts[status.status] = (counts[status.status] ?? 0) + 1;
          return counts;
        },
        {},
      );
      this.logger?.info("MCP startup completed", {
        ...traceContextToLogContext(traceContext),
        durationMs: Date.now() - startedAt,
        event: "mcp.startup.completed",
        module: "core.runtime",
        serverCount: Object.keys(servers).length,
        status: "completed",
        statusCounts,
        toolCount: snapshot.tools.length,
      });
      return snapshot;
    })
    .catch((error) => {
      this.logger?.warn("MCP startup failed", {
        ...traceContextToLogContext(traceContext),
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        event: "mcp.startup.failed",
        module: "core.runtime",
        status: "failed",
      });
      return { statuses: {}, tools: [] };
    });
  this.mcpStartupPromise = this.trackResidencyBlockingWork(startup);
  this.logger?.debug("MCP startup scheduled", {
    ...traceContextToLogContext(traceContext),
    event: "mcp.startup.scheduled",
    module: "core.runtime",
    serverCount: Object.keys(servers).length,
    status: "started",
  });
  return this.mcpStartupPromise;
}

/**
 * Registers MCP descriptors into the session tool registry with the session's allow/deny lists and
 * the official-CUA authority gate. Shared by startup and per-server resync so the model-visible
 * name projection (and CUA aliases) cannot drift between the two paths.
 */
function registerSessionMcpTools(
  runtime: AgentRuntimeInternal,
  mcpPort: McpPort,
  descriptors: readonly McpToolDescriptor[],
): string[] {
  return registerMcpTools(runtime.registry, mcpPort, descriptors, {
    allowedTools: runtime.config.toolAllowlist,
    disallowedTools: runtime.config.toolDisallowlist,
    officialCuaServerNames: computeOfficialCuaServerNames(
      runtime.config.mcp?.servers ?? {},
      new Set(runtime.config.mcp?.trustedOfficialCuaServerNames ?? []),
    ),
  });
}

/**
 * Single-flight: turn loop, compaction and plugin-reference all await this. The old boolean guard
 * let two overlapping callers both pass it while startup was still pending and register every
 * tool twice (overwrite warnings on the TUI); sharing the in-flight promise closes that window.
 */
export function initializeMcp(
  this: AgentRuntimeInternal,
  traceContext: TraceContext,
): Promise<void> {
  if (this.mcpToolsRegistered) return Promise.resolve();
  this.mcpInitPromise ??= runMcpInitialization(this, traceContext);
  return this.mcpInitPromise;
}

async function runMcpInitialization(
  runtime: AgentRuntimeInternal,
  traceContext: TraceContext,
): Promise<void> {
  const startup = runtime.startMcpStartup(traceContext);
  const mcpPort = runtime.mcpPort;
  if (!startup || !mcpPort) {
    runtime.mcpToolsRegistered = true;
    return;
  }
  const serverCount = Object.keys(runtime.config.mcp?.servers ?? {}).length;

  try {
    const snapshot = await startup;
    const registered = registerSessionMcpTools(runtime, mcpPort, snapshot.tools);
    if (registered.length > 0) {
      runtime.invalidateToolCache();
    }
    runtime.logger?.info("MCP tools registered", {
      ...traceContextToLogContext(traceContext),
      event: "mcp.tools.registered",
      module: "core.runtime",
      registeredToolCount: registered.length,
      serverCount,
      status: "completed",
    });
  } catch (error) {
    runtime.mcpToolsRegistered = true;
    runtime.logger?.warn("MCP initialization failed", {
      ...traceContextToLogContext(traceContext),
      error: error instanceof Error ? error.message : String(error),
      event: "mcp.initialization.failed",
      module: "core.runtime",
      status: "failed",
    });
  }
  runtime.mcpToolsRegistered = true;
}

/**
 * Applies one server's (new) state to the live session (specs/tui/mcp-manager.md section 3/4):
 * reconnects it through the port with the runtime's own server config (only that copy carries
 * broker credentials injected at startup), then replaces that server's tool entries.
 * `enabled` is written back into `config.mcp.servers` so a later full `connectConfiguredServers`
 * convergence cannot revive a server the user turned off. Callers serialize invocations.
 */
export async function applyMcpServerState(
  this: AgentRuntimeInternal,
  input: { enabled?: boolean; name: string; traceContext: TraceContext },
): Promise<McpServerStatus> {
  const mcpPort = this.mcpPort;
  if (!mcpPort || this.config.mcp?.enabled === false) throw new Error("MCP is disabled");
  await this.initializeMcp(input.traceContext);

  const servers = this.config.mcp?.servers ?? {};
  const current = servers[input.name];
  if (!current) throw new Error(`MCP server is not configured: ${input.name}`);
  const next: McpServerConfig =
    input.enabled === undefined ? current : { ...current, enabled: input.enabled };
  this.config.mcp = { ...this.config.mcp, servers: { ...servers, [input.name]: next } };

  const status = await mcpPort.connectServer(input.name, next, {
    trace: input.traceContext,
    workingDirectory: this.workingDirectory,
    workspaceIdentity: this.config.workspaceIdentity?.toString(),
  });

  // Unregister first: ToolRegistry.register console.warns on overwrite, which would scribble
  // over the TUI on every reconnect.
  for (const name of this.registry.list()) {
    if (this.registry.getMetadata(name)?.mcpPresentation?.serverName === input.name) {
      this.registry.unregister(name);
    }
  }
  const descriptors = (await mcpPort.listTools()).filter(
    (descriptor) => descriptor.serverName === input.name,
  );
  registerSessionMcpTools(this, mcpPort, descriptors);
  this.invalidateToolCache();
  this.logger?.info("MCP server state applied", {
    ...traceContextToLogContext(input.traceContext),
    event: "mcp.server.state.applied",
    mcpServerName: input.name,
    module: "core.runtime",
    mcpServerStatus: status.status,
    status: "completed",
    toolCount: descriptors.length,
  });
  return status;
}

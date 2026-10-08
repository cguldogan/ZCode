// MCP manager facade (specs/tui/mcp-manager.md). Single entry for listing servers with their
// origin, toggling `enabled` and reconnecting. Persistence goes through the config-file patch
// (the one owner of `enabled`); the live session is then resynced by the runtime.
import { updateMcpServerEnabledInFileConfig } from "@zcode/adapters/config";
import type { ConfigResult } from "@zcode/adapters/config";
import type { McpPort, McpServerConfig, TraceContext } from "@zcode/contracts";
import { listMcpServerStatuses } from "../mcp-config.js";
import type {
  ZCodeMcpServerActionErrorCode,
  ZCodeMcpServerActionResult,
  ZCodeMcpServerEntry,
  ZCodeMcpServerOrigin,
} from "./mcp-types.js";
import type { ZCodeApp } from "./types.js";

export type McpFacade = Pick<
  ZCodeApp,
  "listMcpServerEntries" | "reconnectMcpServer" | "setMcpServerEnabled"
>;

/** The slice of AgentRuntime the facade drives; keeps the facade testable with a fake. */
export interface McpFacadeRuntime {
  applyMcpServerState(input: {
    enabled?: boolean;
    name: string;
    traceContext: TraceContext;
  }): Promise<unknown>;
}

export interface CreateMcpFacadeDeps {
  /** Mutated in place on toggle so the legacy `/mcp connect` path sees the new flag. */
  configuredMcpServers: Record<string, McpServerConfig>;
  /** Owner plugin ids of the host-provided `node_repl` (enabled Browser Use / Computer Use). */
  builtInOwnerPluginIds: readonly string[];
  builtInServerNames: ReadonlySet<string>;
  /** True when a protocol host supplied `runtimeConfig.mcp.servers` (config files are not the source). */
  hostSuppliedServers: boolean;
  getRuntime(): McpFacadeRuntime;
  mcpPort?: McpPort;
  persistEnabled?: typeof updateMcpServerEnabledInFileConfig;
  pluginServerNames: ReadonlySet<string>;
  prepare(): Promise<void>;
  serverPaths: Readonly<Record<string, string>>;
  serverSources: ConfigResult["sources"]["mcp"]["serverSources"];
  traceContext: TraceContext;
  untrustedProjectMcpServers: ReadonlySet<string>;
}

const TOGGLEABLE_ORIGINS: ReadonlySet<ZCodeMcpServerOrigin> = new Set(["user", "project"]);
const PLUGIN_SERVER_NAME = /^plugin:([^:]+):/;

export function resolveMcpServerOrigin(
  name: string,
  deps: Pick<
    CreateMcpFacadeDeps,
    "builtInServerNames" | "hostSuppliedServers" | "pluginServerNames" | "serverSources"
  >,
): ZCodeMcpServerOrigin {
  // Built-ins are merged last and cannot be shadowed by user config, so they win.
  if (deps.builtInServerNames.has(name)) return "builtin";
  if (deps.hostSuppliedServers) return deps.pluginServerNames.has(name) ? "plugin" : "host";
  const source = deps.serverSources[name];
  if (source) return source;
  return deps.pluginServerNames.has(name) ? "plugin" : "host";
}

export function createMcpFacade(deps: CreateMcpFacadeDeps): McpFacade {
  const persistEnabled = deps.persistEnabled ?? updateMcpServerEnabledInFileConfig;
  // Actions are admitted one at a time so two quick toggles end in the last requested state both
  // on disk and live (file write and runtime resync are two steps and must not interleave).
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  const buildEntries = async (): Promise<ZCodeMcpServerEntry[]> => {
    const statuses = await listMcpServerStatuses(
      deps.mcpPort,
      deps.configuredMcpServers,
      deps.untrustedProjectMcpServers,
    );
    const tools = deps.mcpPort ? await deps.mcpPort.listTools() : [];
    return Object.entries(statuses)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, status]) => {
        const origin = resolveMcpServerOrigin(name, deps);
        const configPath = TOGGLEABLE_ORIGINS.has(origin) ? deps.serverPaths[name] : undefined;
        const ownerPluginIds = ownerPlugins(name, origin, deps);
        return {
          name,
          status,
          origin,
          ...(configPath ? { configPath } : {}),
          ...(ownerPluginIds.length > 0 ? { ownerPluginIds } : {}),
          toggleable: Boolean(deps.mcpPort && configPath && name in deps.configuredMcpServers),
          toolNames: tools.filter((tool) => tool.serverName === name).map((tool) => tool.toolName),
        };
      });
  };

  const entryResult = async (name: string): Promise<ZCodeMcpServerActionResult> => {
    const entry = (await buildEntries()).find((candidate) => candidate.name === name);
    return entry
      ? { ok: true, entry }
      : fail("not_configured", `MCP server is not configured: ${name}`);
  };

  const apply = async (
    name: string,
    enabled: boolean | undefined,
  ): Promise<ZCodeMcpServerActionResult> => {
    try {
      await deps.prepare();
      await deps
        .getRuntime()
        .applyMcpServerState({ enabled, name, traceContext: deps.traceContext });
    } catch (error) {
      return fail("apply_failed", errorMessage(error));
    }
    return entryResult(name);
  };

  return {
    listMcpServerEntries: buildEntries,
    setMcpServerEnabled: (name, enabled) =>
      serialize(async () => {
        const config = deps.configuredMcpServers[name];
        if (!config) return fail("not_configured", `MCP server is not configured: ${name}`);
        if (!deps.mcpPort) return fail("mcp_unavailable", "MCP is disabled");
        const origin = resolveMcpServerOrigin(name, deps);
        const configPath = TOGGLEABLE_ORIGINS.has(origin) ? deps.serverPaths[name] : undefined;
        if (!configPath) {
          return fail("read_only", `MCP server ${name} (${origin}) cannot be toggled here`);
        }
        try {
          await persistEnabled(configPath, name, enabled);
        } catch (error) {
          // Nothing was written, so the live session is intentionally left untouched.
          return fail("persist_failed", errorMessage(error));
        }
        deps.configuredMcpServers[name] = { ...config, enabled };
        return apply(name, enabled);
      }),
    reconnectMcpServer: (name) =>
      serialize(async () => {
        const config = deps.configuredMcpServers[name];
        if (!config) return fail("not_configured", `MCP server is not configured: ${name}`);
        if (!deps.mcpPort) return fail("mcp_unavailable", "MCP is disabled");
        if (config.enabled === false) return fail("disabled", `MCP server ${name} is disabled`);
        return apply(name, undefined);
      }),
  };
}

function ownerPlugins(
  name: string,
  origin: ZCodeMcpServerOrigin,
  deps: Pick<CreateMcpFacadeDeps, "builtInOwnerPluginIds">,
): string[] {
  if (origin === "builtin") return [...deps.builtInOwnerPluginIds];
  if (origin !== "plugin") return [];
  const pluginName = PLUGIN_SERVER_NAME.exec(name)?.[1];
  return pluginName ? [pluginName] : [];
}

function fail(code: ZCodeMcpServerActionErrorCode, message: string): ZCodeMcpServerActionResult {
  return { code, message, ok: false };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

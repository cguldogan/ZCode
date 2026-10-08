// specs/tui/mcp-manager.md §3/§4 — applyMcpServerState against a stateful fake McpPort and the
// real ToolRegistry: disabling removes the server's tools, enabling restores them, initialization
// is single-flight, and the runtime config keeps the new flag.
import assert from "node:assert/strict";
import test from "node:test";
import type {
  McpConnectionSnapshot,
  McpServerConfig,
  McpServerStatus,
  McpToolDescriptor,
  TraceContext,
  TraceId,
} from "@zcode/contracts";
import { createToolRegistry } from "../src/tool/registry.js";
import { applyMcpServerState, initializeMcp } from "../src/runtime/methods/mcp.js";

const TRACE: TraceContext = { traceId: "trace_mcp" as TraceId };
const TOOLS = ["alpha", "beta"];

class FakeMcpPort {
  readonly records = new Map<string, { config: McpServerConfig; status: McpServerStatus }>();
  connectCalls = 0;

  private statusFor(config: McpServerConfig, status: McpServerStatus["status"]): McpServerStatus {
    return { status, transport: config.type, toolCount: 0, updatedAt: "now" };
  }

  async connectServer(name: string, config: McpServerConfig): Promise<McpServerStatus> {
    this.connectCalls += 1;
    const status =
      config.enabled === false
        ? this.statusFor(config, "disabled")
        : { ...this.statusFor(config, "connected"), toolCount: TOOLS.length };
    this.records.set(name, { config, status });
    return status;
  }

  async connectConfiguredServers(
    servers: Record<string, McpServerConfig>,
  ): Promise<McpConnectionSnapshot> {
    for (const [name, config] of Object.entries(servers)) await this.connectServer(name, config);
    return { statuses: await this.status(), tools: await this.listTools() };
  }

  async status(): Promise<Record<string, McpServerStatus>> {
    return Object.fromEntries([...this.records].map(([name, r]) => [name, r.status]));
  }

  async listTools(): Promise<McpToolDescriptor[]> {
    return [...this.records]
      .filter(([, r]) => r.status.status === "connected")
      .flatMap(([serverName]) =>
        TOOLS.map((toolName) => ({
          serverName,
          toolName,
          inputSchema: { type: "object", properties: {} },
        })),
      );
  }
}

function createRuntime(servers: Record<string, McpServerConfig>) {
  const port = new FakeMcpPort();
  let invalidations = 0;
  const runtime = {
    config: { mcp: { enabled: true, servers } },
    invalidateToolCache: () => {
      invalidations += 1;
    },
    mcpPort: port,
    mcpToolsRegistered: false,
    registry: createToolRegistry(),
    startMcpStartup(this: { mcpPort: FakeMcpPort }) {
      return this.mcpPort.connectConfiguredServers(servers);
    },
    workingDirectory: "/work",
  } as unknown as Record<string, any>;
  runtime.initializeMcp = initializeMcp;
  runtime.applyMcpServerState = applyMcpServerState;
  return { invalidations: () => invalidations, port, runtime };
}

const stdio = (extra: Partial<McpServerConfig> = {}): McpServerConfig => ({
  type: "stdio",
  command: "demo",
  ...extra,
});
const toolNames = (runtime: Record<string, any>, server: string) =>
  (runtime.registry.list() as string[]).filter((name) => name.startsWith(`mcp__${server}__`)).sort();

test("disable removes that server's tools only; enable restores them", async () => {
  const { port, runtime } = createRuntime({ a: stdio(), b: stdio() });
  await runtime.initializeMcp(TRACE);
  assert.deepEqual(toolNames(runtime, "a"), ["mcp__a__alpha", "mcp__a__beta"]);
  assert.equal(toolNames(runtime, "b").length, 2);

  const off = await runtime.applyMcpServerState({ enabled: false, name: "a", traceContext: TRACE });
  assert.equal(off.status, "disabled");
  assert.deepEqual(toolNames(runtime, "a"), []);
  assert.equal(toolNames(runtime, "b").length, 2);
  assert.equal(runtime.config.mcp.servers.a.enabled, false);
  assert.equal(port.records.get("a")?.config.enabled, false);

  const on = await runtime.applyMcpServerState({ enabled: true, name: "a", traceContext: TRACE });
  assert.equal(on.status, "connected");
  assert.deepEqual(toolNames(runtime, "a"), ["mcp__a__alpha", "mcp__a__beta"]);
});

test("reconnect without an enabled change keeps config and re-registers tools", async () => {
  const { port, runtime } = createRuntime({ a: stdio() });
  await runtime.initializeMcp(TRACE);
  const before = port.connectCalls;
  const status = await runtime.applyMcpServerState({ name: "a", traceContext: TRACE });
  assert.equal(status.status, "connected");
  assert.equal(port.connectCalls, before + 1);
  assert.equal(toolNames(runtime, "a").length, 2);
});

test("initializeMcp is single-flight: overlapping callers connect and register once", async () => {
  const { port, runtime } = createRuntime({ a: stdio() });
  await Promise.all([runtime.initializeMcp(TRACE), runtime.initializeMcp(TRACE)]);
  assert.equal(port.connectCalls, 1);
  assert.equal(toolNames(runtime, "a").length, 2);
});

test("unknown servers and a disabled MCP feature are errors", async () => {
  const { runtime } = createRuntime({ a: stdio() });
  await assert.rejects(
    runtime.applyMcpServerState({ enabled: false, name: "ghost", traceContext: TRACE }),
    /not configured/,
  );
  runtime.config.mcp.enabled = false;
  await assert.rejects(
    runtime.applyMcpServerState({ name: "a", traceContext: TRACE }),
    /MCP is disabled/,
  );
});

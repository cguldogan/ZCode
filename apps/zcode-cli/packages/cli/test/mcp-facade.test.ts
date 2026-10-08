// specs/tui/mcp-manager.md §2-§4 — the toggle writes the single owner (config file), then resyncs
// the live runtime; a reload of the config still sees the server disabled.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createConfig } from "@zcode/adapters/config";
import { createMcpFacade, resolveMcpServerOrigin } from "@zcode/bootstrap";
import type { McpPort, McpServerConfig, McpToolDescriptor, TraceId } from "@zcode/contracts";
import { handleMcpCommand } from "../src/command-center/handlers/mcp.js";

const TRACE = { traceId: "trace_facade" as TraceId };

type Harness = Awaited<ReturnType<typeof setup>>;

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "zcode-mcp-facade-"));
  const path = join(dir, "config.json");
  await writeFile(
    path,
    JSON.stringify({ mcp: { servers: { demo: { type: "stdio", command: "demo" } } } }),
  );
  const loadConfig = () => createConfig({ env: {}, userConfigPath: path, workingDirectory: dir });
  const configResult = loadConfig();
  const configured: Record<string, McpServerConfig> = {
    ...configResult.config.mcp.servers,
    node_repl: { type: "stdio", command: "repl" },
  };
  const applied: Array<{ enabled?: boolean; name: string }> = [];
  const live = new Map<string, "connected" | "disabled">([
    ["demo", "connected"],
    ["node_repl", "connected"],
  ]);
  const port = {
    async status() {
      return Object.fromEntries(
        [...live].map(([name, status]) => [
          name,
          { status, toolCount: status === "connected" ? 1 : 0, transport: "stdio", updatedAt: "t" },
        ]),
      );
    },
    async listTools(): Promise<McpToolDescriptor[]> {
      return [...live]
        .filter(([, status]) => status === "connected")
        .map(([serverName]) => ({ serverName, toolName: "t", inputSchema: { type: "object" } }));
    },
  } as unknown as McpPort;
  const facade = createMcpFacade({
    builtInOwnerPluginIds: ["browser-use@official"],
    builtInServerNames: new Set(["node_repl"]),
    configuredMcpServers: configured,
    getRuntime: () => ({
      applyMcpServerState: async (input) => {
        applied.push({ enabled: input.enabled, name: input.name });
        live.set(input.name, input.enabled === false ? "disabled" : "connected");
      },
    }),
    hostSuppliedServers: false,
    mcpPort: port,
    pluginServerNames: new Set(),
    prepare: async () => undefined,
    serverPaths: configResult.sources.mcp.serverPaths,
    serverSources: configResult.sources.mcp.serverSources,
    traceContext: TRACE,
    untrustedProjectMcpServers: new Set(),
  });
  return { applied, configured, dir, facade, live, loadConfig, path };
}

async function withHarness(body: (h: Harness) => Promise<void>): Promise<void> {
  const harness = await setup();
  try {
    await body(harness);
  } finally {
    await rm(harness.dir, { recursive: true, force: true });
  }
}

test("entries carry origin, config path, tools and toggle ability", () =>
  withHarness(async ({ facade, path }) => {
    const entries = await facade.listMcpServerEntries();
    const demo = entries.find((e) => e.name === "demo")!;
    assert.deepEqual(
      { origin: demo.origin, configPath: demo.configPath, toggleable: demo.toggleable },
      { origin: "user", configPath: path, toggleable: true },
    );
    assert.deepEqual(demo.toolNames, ["t"]);
    const repl = entries.find((e) => e.name === "node_repl")!;
    assert.equal(repl.origin, "builtin");
    assert.equal(repl.toggleable, false);
    assert.deepEqual(repl.ownerPluginIds, ["browser-use@official"]);
  }));

test("disable persists to the config file, resyncs the runtime, and survives a reload", () =>
  withHarness(async ({ applied, configured, facade, loadConfig, path }) => {
    const result = await facade.setMcpServerEnabled("demo", false);
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.entry.status.status, "disabled");
    assert.deepEqual(applied, [{ enabled: false, name: "demo" }]);
    assert.equal(JSON.parse(await readFile(path, "utf8")).mcp.servers.demo.enabled, false);
    assert.equal(configured.demo?.enabled, false);
    // "Next launch": a fresh config load still has the server disabled.
    assert.equal(loadConfig().config.mcp.servers?.demo?.enabled, false);

    const again = await facade.setMcpServerEnabled("demo", true);
    assert.equal(again.ok && again.entry.status.status, "connected");
    assert.equal(loadConfig().config.mcp.servers?.demo?.enabled !== false, true);
  }));

test("built-in and unknown servers are rejected without touching the file or runtime", () =>
  withHarness(async ({ applied, facade, path }) => {
    const before = await readFile(path, "utf8");
    const builtin = await facade.setMcpServerEnabled("node_repl", false);
    assert.equal(!builtin.ok && builtin.code, "read_only");
    const ghost = await facade.setMcpServerEnabled("ghost", false);
    assert.equal(!ghost.ok && ghost.code, "not_configured");
    assert.deepEqual(applied, []);
    assert.equal(await readFile(path, "utf8"), before);
  }));

test("a persist failure leaves the runtime untouched", () =>
  withHarness(async ({ applied, configured, dir, facade, path }) => {
    await rm(path);
    await writeFile(join(dir, "other"), "x");
    const result = await facade.setMcpServerEnabled("demo", false);
    assert.equal(!result.ok && result.code, "persist_failed");
    assert.deepEqual(applied, []);
    assert.equal(configured.demo?.enabled, undefined);
  }));

test("reconnect needs an enabled server and keeps the flag", () =>
  withHarness(async ({ applied, facade }) => {
    const ok = await facade.reconnectMcpServer("node_repl");
    assert.equal(ok.ok, true);
    assert.deepEqual(applied, [{ enabled: undefined, name: "node_repl" }]);
    await facade.setMcpServerEnabled("demo", false);
    const off = await facade.reconnectMcpServer("demo");
    assert.equal(!off.ok && off.code, "disabled");
  }));

test("quick consecutive toggles are applied in order and end in the last requested state", () =>
  withHarness(async ({ applied, facade, live, path }) => {
    await Promise.all([
      facade.setMcpServerEnabled("demo", false),
      facade.setMcpServerEnabled("demo", true),
    ]);
    assert.deepEqual(
      applied.map((a) => a.enabled),
      [false, true],
    );
    assert.equal(live.get("demo"), "connected");
    assert.equal("enabled" in JSON.parse(await readFile(path, "utf8")).mcp.servers.demo, false);
  }));

test("origin resolution: built-in wins, then host-supplied, config layers, plugins", () => {
  const base = {
    builtInServerNames: new Set(["node_repl"]),
    hostSuppliedServers: false,
    pluginServerNames: new Set(["plugin:p:s"]),
    serverSources: { a: "project", b: "user", c: "cli" } as const,
  };
  assert.equal(resolveMcpServerOrigin("node_repl", base), "builtin");
  assert.equal(resolveMcpServerOrigin("a", base), "project");
  assert.equal(resolveMcpServerOrigin("c", base), "cli");
  assert.equal(resolveMcpServerOrigin("plugin:p:s", base), "plugin");
  assert.equal(resolveMcpServerOrigin("a", { ...base, hostSuppliedServers: true }), "host");
});

test("/mcp enable|disable text command forwards to the app and reports the outcome", async () => {
  const calls: Array<[string, boolean]> = [];
  const entry = {
    name: "demo",
    origin: "user",
    status: { status: "disabled", toolCount: 0, transport: "stdio", updatedAt: "t" },
    toggleable: true,
    toolNames: [],
  };
  const deps = {
    getApp: async () => ({
      setMcpServerEnabled: async (name: string, enabled: boolean) => {
        calls.push([name, enabled]);
        return name === "demo"
          ? { entry, ok: true }
          : { code: "not_configured", message: "nope", ok: false };
      },
    }),
    getMode: () => "build",
  } as never;
  const off = await handleMcpCommand("disable demo", deps);
  assert.deepEqual(calls, [["demo", false]]);
  assert.match(off.response ?? "", /disabled: demo: disabled/);
  const bad = await handleMcpCommand("enable ghost", deps);
  assert.match(bad.response ?? "", /Unable to enable MCP server ghost: nope/);
  const usage = await handleMcpCommand("enable", deps);
  assert.match(usage.response ?? "", /^Usage:/);
});

// specs/tui/mcp-manager.md §2 — the persisted `enabled` flag has one writer rule and survives reload.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createConfig, updateMcpServerEnabledInFileConfig } from "../src/config/index.js";

async function withUserConfig(
  body: (input: { dir: string; path: string }) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "zcode-mcp-enabled-"));
  try {
    const path = join(dir, "config.json");
    await writeFile(
      path,
      JSON.stringify({
        ui: { theme: "dark" },
        mcp: { servers: { demo: { type: "stdio", command: "node", args: ["x"], enable: false } } },
        customKey: { keep: true },
      }),
    );
    await body({ dir, path });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("disabling writes enabled:false, drops legacy enable, keeps unrelated keys", () =>
  withUserConfig(async ({ path }) => {
    await updateMcpServerEnabledInFileConfig(path, "demo", false);
    const raw = JSON.parse(await readFile(path, "utf8"));
    assert.deepEqual(raw.mcp.servers.demo, {
      type: "stdio",
      command: "node",
      args: ["x"],
      enabled: false,
    });
    assert.deepEqual(raw.customKey, { keep: true });
    assert.equal(raw.ui.theme, "dark");
  }));

test("enabling removes the enabled key entirely", () =>
  withUserConfig(async ({ path }) => {
    await updateMcpServerEnabledInFileConfig(path, "demo", false);
    await updateMcpServerEnabledInFileConfig(path, "demo", true);
    const raw = JSON.parse(await readFile(path, "utf8"));
    assert.equal("enabled" in raw.mcp.servers.demo, false);
    assert.equal("enable" in raw.mcp.servers.demo, false);
  }));

test("a server missing from the file is an error and the file is untouched", () =>
  withUserConfig(async ({ path }) => {
    const before = await readFile(path, "utf8");
    await assert.rejects(updateMcpServerEnabledInFileConfig(path, "ghost", false), /ghost/);
    assert.equal(await readFile(path, "utf8"), before);
  }));

test("a disabled server stays disabled after reload, and serverPaths points at its file", () =>
  withUserConfig(async ({ dir, path }) => {
    await updateMcpServerEnabledInFileConfig(path, "demo", false);
    const reloaded = createConfig({ env: {}, userConfigPath: path, workingDirectory: dir });
    assert.equal(reloaded.config.mcp.servers?.demo?.enabled, false);
    assert.equal(reloaded.sources.mcp.serverSources.demo, "user");
    assert.equal(reloaded.sources.mcp.serverPaths.demo, path);
    await updateMcpServerEnabledInFileConfig(path, "demo", true);
    const again = createConfig({ env: {}, userConfigPath: path, workingDirectory: dir });
    assert.notEqual(again.config.mcp.servers?.demo?.enabled, false);
  }));

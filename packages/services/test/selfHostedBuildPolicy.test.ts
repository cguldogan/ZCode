import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { decodeZCodeBuiltinRelease } from "@zcode/provider-node";
import { ZCODE_REMOTE_UPDATES_ENABLED, ZCODE_TELEMETRY_ENABLED } from "@zcode/shared";

// Guards specs/self-hosted-build/remote-updates-and-litellm.md against upstream merges that
// silently flip the policy or drop the LiteLLM template.

const bundledConfigPath = fileURLToPath(
  new URL("../../../config/provider/zcode-builtin.json", import.meta.url),
);

test("self-hosted build keeps remote updates disabled", () => {
  assert.equal(ZCODE_REMOTE_UPDATES_ENABLED, false);
});

test("self-hosted build keeps telemetry (ARMS and data warehouse) disabled", () => {
  assert.equal(ZCODE_TELEMETRY_ENABLED, false);
});

test("bundled provider config ships the LiteLLM template", async () => {
  const release = decodeZCodeBuiltinRelease(JSON.parse(await readFile(bundledConfigPath, "utf8")));
  const template = release.config.providerTemplates.get("litellm" as never);
  assert.ok(template, "litellm template missing from bundled config");
  const config = template.config.toJSON();
  assert.equal(config.api?.type, "openai-chat-completions");
  assert.equal(config.api?.baseUrl, "http://localhost:4000/v1");
  assert.equal(config.access?.type, "api-key");
});

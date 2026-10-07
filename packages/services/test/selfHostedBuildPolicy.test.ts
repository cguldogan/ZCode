import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { decodeZCodeBuiltinRelease } from "@zcode/provider-node";
import {
  isChinaEgressBlockedUrl,
  PRODUCT_DISPLAY_NAME,
  ZCODE_REMOTE_UPDATES_ENABLED,
  ZCODE_TELEMETRY_ENABLED,
  ZCODE_VENDOR_ACCOUNTS_ENABLED,
} from "@zcode/shared";

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

test("local-only build has vendor accounts disabled", () => {
  assert.equal(ZCODE_VENDOR_ACCOUNTS_ENABLED, false);
});

test("bundled provider config ships no vendor accounts and nothing China-operated", async () => {
  const raw = JSON.parse(await readFile(bundledConfigPath, "utf8"));
  const release = decodeZCodeBuiltinRelease(raw);
  assert.deepEqual([...release.config.providers.keys()], []);
  const templateIds = [...release.config.providerTemplates.keys()];
  assert.ok(templateIds.includes("litellm"));
  for (const templateId of templateIds) {
    const baseUrl = release.config.providerTemplates.get(templateId)?.config.toJSON().api?.baseUrl;
    assert.equal(isChinaEgressBlockedUrl(baseUrl ?? ""), false, `${templateId}: ${baseUrl}`);
  }
  const rules = raw.config.modelConfigRules as {
    templateModelRules: Array<{ templateId: string }>;
    builtinProviderModelRules: unknown[];
  };
  assert.deepEqual(rules.builtinProviderModelRules, []);
  for (const rule of rules.templateModelRules) {
    assert.ok(templateIds.includes(rule.templateId), `orphan model rule for ${rule.templateId}`);
  }
});

test("ZCode Beyond desktop identity matches the brand and never reuses ZCode's bundle id", async () => {
  // @ts-expect-error -- plain build-time ESM script without type declarations
  const identity = await import("../../desktop/scripts/desktop-product-identity.mjs");
  const { production, preview } = identity.desktopProductIdentities;
  assert.equal(PRODUCT_DISPLAY_NAME, "ZCode Beyond");
  assert.equal(production.productName, PRODUCT_DISPLAY_NAME);
  assert.equal(preview.productName, `${PRODUCT_DISPLAY_NAME} Preview`);
  for (const { appId } of [production, preview]) {
    assert.ok(appId.startsWith("io.github.cguldogan.zcodebeyond"), appId);
    assert.ok(!appId.startsWith("dev.zcode"), appId);
  }
});

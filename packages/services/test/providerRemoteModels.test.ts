import assert from "node:assert/strict";
import test from "node:test";
import type { ProviderSettingsFacade } from "@zcode/provider";
import { createProviderSettingsService } from "../src/model-provider/providerFacadeServices.js";
import {
  listOpenAiCompatibleModels,
  parseOpenAiModelList,
} from "../src/model-provider/providerRemoteModels.js";

const litellmConfig = {
  api: { type: "openai-chat-completions", baseUrl: "http://localhost:4000/v1/" },
  access: { type: "api-key", apiKey: " sk-test-only " },
} as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("lists sorted, de-duplicated ids from the saved base URL with the saved key", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const result = await listOpenAiCompatibleModels({
    config: litellmConfig,
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return jsonResponse({
        object: "list",
        data: [{ id: "gpt-4o" }, { id: "claude-sonnet" }, { id: "gpt-4o" }, { id: " " }, {}],
      });
    },
  });
  assert.deepEqual(result, { ok: true, modelIds: ["claude-sonnet", "gpt-4o"] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "http://localhost:4000/v1/models");
  assert.equal(calls[0]!.init.redirect, "error");
  assert.equal(
    (calls[0]!.init.headers as Record<string, string>).Authorization,
    "Bearer sk-test-only",
  );
});

test("refuses non OpenAI-compatible API types without a request", async () => {
  let called = false;
  const result = await listOpenAiCompatibleModels({
    config: { ...litellmConfig, api: { type: "anthropic-messages", baseUrl: "https://a.example" } },
    fetch: async () => {
      called = true;
      return jsonResponse({ data: [] });
    },
  });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.code, "unsupported-api-type");
  assert.equal(called, false);
});

test("requires a saved base URL and API key", async () => {
  const noFetch = async (): Promise<Response> => assert.fail("must not fetch");
  const missingKey = await listOpenAiCompatibleModels({
    config: { api: litellmConfig.api, access: { type: "api-key", apiKey: "  " } },
    fetch: noFetch,
  });
  assert.equal(!missingKey.ok && missingKey.code, "missing-api-key");
  const missingUrl = await listOpenAiCompatibleModels({
    config: { api: { type: "openai-chat-completions", baseUrl: "" }, access: litellmConfig.access },
    fetch: noFetch,
  });
  assert.equal(!missingUrl.ok && missingUrl.code, "missing-base-url");
});

test("maps HTTP, network, timeout and malformed responses to stable codes", async () => {
  const http = await listOpenAiCompatibleModels({
    config: litellmConfig,
    fetch: async () => jsonResponse({ error: "bad key" }, 401),
  });
  assert.equal(!http.ok && http.code, "http-401");

  const network = await listOpenAiCompatibleModels({
    config: litellmConfig,
    fetch: async () => {
      throw new TypeError("fetch failed");
    },
  });
  assert.equal(!network.ok && network.code, "network");

  const timeout = await listOpenAiCompatibleModels({
    config: litellmConfig,
    timeoutMs: 20,
    fetch: (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }),
  });
  assert.equal(!timeout.ok && timeout.code, "timeout");

  const malformed = await listOpenAiCompatibleModels({
    config: litellmConfig,
    fetch: async () => jsonResponse({ models: ["a"] }),
  });
  assert.equal(!malformed.ok && malformed.code, "invalid-response");

  const oversized = await listOpenAiCompatibleModels({
    config: litellmConfig,
    maxBodyBytes: 16,
    fetch: async () => jsonResponse({ data: [{ id: "a-model-with-a-long-name" }] }),
  });
  assert.equal(!oversized.ok && oversized.code, "invalid-response");
});

test("parseOpenAiModelList rejects non-list payloads", () => {
  assert.equal(parseOpenAiModelList(null), null);
  assert.equal(parseOpenAiModelList({ data: "x" }), null);
  assert.deepEqual(parseOpenAiModelList({ data: [] }), []);
});

test("service waits for pending provider saves, then reads the saved config", async () => {
  const order: string[] = [];
  const facade = {
    waitForProviderOperations: async (providerId: string) => {
      order.push(`wait:${providerId}`);
    },
    getView: () => {
      order.push("view");
      return {
        providers: [
          {
            providerId: "litellm-1",
            effectiveConfig: { ...litellmConfig, api: { ...litellmConfig.api, type: "x" } },
          },
        ],
      };
    },
  } as unknown as ProviderSettingsFacade;
  const service = createProviderSettingsService(facade);

  const missing = await service.listRemoteModels({ providerId: "nope" as never });
  assert.equal(!missing.ok && missing.code, "provider-not-found");

  const unsupported = await service.listRemoteModels({ providerId: "litellm-1" as never });
  assert.equal(!unsupported.ok && unsupported.code, "unsupported-api-type");
  assert.deepEqual(order, ["wait:nope", "view", "wait:litellm-1", "view"]);
});

test("real HTTP: lists models from a LiteLLM-style server and refuses redirects", async () => {
  const { createServer } = await import("node:http");
  const seenAuth: (string | undefined)[] = [];
  const server = createServer((req, res) => {
    seenAuth.push(req.headers.authorization);
    if (req.url === "/v1/models") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ object: "list", data: [{ id: "local-qwen" }, { id: "gpt-4o" }] }));
      return;
    }
    // Redirecting endpoint: following it would leak the key to another origin.
    res.writeHead(302, { Location: "http://127.0.0.1:1/steal" });
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  try {
    const ok = await listOpenAiCompatibleModels({
      config: {
        api: { type: "openai-chat-completions", baseUrl: `http://127.0.0.1:${port}/v1` },
        access: { type: "api-key", apiKey: "sk-test-only" },
      },
    });
    assert.deepEqual(ok, { ok: true, modelIds: ["gpt-4o", "local-qwen"] });

    const redirected = await listOpenAiCompatibleModels({
      config: {
        api: { type: "openai-chat-completions", baseUrl: `http://127.0.0.1:${port}/redirect` },
        access: { type: "api-key", apiKey: "sk-test-only" },
      },
    });
    assert.equal(!redirected.ok && redirected.code, "network");
    assert.deepEqual(seenAuth, ["Bearer sk-test-only", "Bearer sk-test-only"]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

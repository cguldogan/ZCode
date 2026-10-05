import type { ProviderConfigObject, ProviderId } from "@zcode/provider";

/**
 * Remote model discovery for OpenAI-compatible providers (LiteLLM, OpenAI, …).
 * Spec: specs/self-hosted-build/remote-updates-and-litellm.md §2.3.
 * Reads only the saved provider config; the result is transient and never persisted.
 */

export interface ProviderRemoteModelsInput {
  readonly providerId: ProviderId;
}

export type ProviderRemoteModelsErrorCode =
  | "unsupported-api-type"
  | "provider-not-found"
  | "missing-base-url"
  | "missing-api-key"
  | "timeout"
  | "network"
  | `http-${number}`
  | "invalid-response";

export type ProviderRemoteModelsResult =
  | { readonly ok: true; readonly modelIds: readonly string[] }
  | {
      readonly ok: false;
      readonly code: ProviderRemoteModelsErrorCode;
      readonly message: string;
    };

const REMOTE_MODELS_TIMEOUT_MS = 15_000;
const REMOTE_MODELS_MAX_BODY_BYTES = 2_000_000;
const OPENAI_COMPATIBLE_API_TYPES: ReadonlySet<string> = new Set([
  "openai-chat-completions",
  "openai-responses",
]);

export function supportsRemoteModelDiscovery(apiType: string | null | undefined): boolean {
  return apiType != null && OPENAI_COMPATIBLE_API_TYPES.has(apiType);
}

export interface ListOpenAiCompatibleModelsOptions {
  readonly config: Pick<ProviderConfigObject, "api" | "access">;
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
  readonly maxBodyBytes?: number;
}

export async function listOpenAiCompatibleModels(
  options: ListOpenAiCompatibleModelsOptions,
): Promise<ProviderRemoteModelsResult> {
  const { api, access } = options.config;
  if (!supportsRemoteModelDiscovery(api?.type)) {
    return failure("unsupported-api-type", "Model discovery needs an OpenAI-compatible API type");
  }
  const baseUrl = api?.baseUrl?.trim();
  if (!baseUrl) return failure("missing-base-url", "Save a base URL first");
  const apiKey = access && "apiKey" in access ? access.apiKey?.trim() : undefined;
  if (!apiKey) return failure("missing-api-key", "Save an API key first");

  let url: URL;
  try {
    url = new URL(`${baseUrl.replace(/\/+$/, "")}/models`);
  } catch {
    return failure("missing-base-url", "Base URL is not a valid URL");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? REMOTE_MODELS_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await (options.fetch ?? globalThis.fetch)(url, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
        // A redirect could forward the key to another origin; refuse instead of following.
        redirect: "error",
        signal: controller.signal,
      });
    } catch {
      return controller.signal.aborted
        ? failure("timeout", "The server did not answer in time")
        : failure("network", "Could not reach the server");
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      return failure(`http-${response.status}`, `Server answered HTTP ${response.status}`);
    }
    let body: unknown;
    try {
      body = JSON.parse(
        await readBodyText(response, options.maxBodyBytes ?? REMOTE_MODELS_MAX_BODY_BYTES),
      );
    } catch {
      return controller.signal.aborted
        ? failure("timeout", "The server did not answer in time")
        : failure("invalid-response", "Response is not a JSON model list");
    }
    const modelIds = parseOpenAiModelList(body);
    return modelIds
      ? { ok: true, modelIds }
      : failure("invalid-response", "Response is not an OpenAI model list");
  } finally {
    clearTimeout(timer);
  }
}

/** OpenAI list shape `{ data: [{ id }] }`; trimmed, de-duplicated, sorted. */
export function parseOpenAiModelList(body: unknown): string[] | null {
  if (!body || typeof body !== "object" || !Array.isArray((body as { data?: unknown }).data)) {
    return null;
  }
  const ids = new Set<string>();
  for (const entry of (body as { data: unknown[] }).data) {
    const id = entry && typeof entry === "object" ? (entry as { id?: unknown }).id : undefined;
    if (typeof id === "string" && id.trim()) ids.add(id.trim());
  }
  return [...ids].sort((left, right) => left.localeCompare(right));
}

async function readBodyText(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes) throw new Error("body limit exceeded");
      chunks.push(decoder.decode(part.value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  }
}

function failure(code: ProviderRemoteModelsErrorCode, message: string): ProviderRemoteModelsResult {
  return { ok: false, code, message };
}

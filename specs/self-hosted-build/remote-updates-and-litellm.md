# Self-hosted build: no remote updates, LiteLLM provider

Status: accepted · Scope: desktop, server, CLI · Owner: provider settings / desktop main

## 1. Goals

1. A source build of ZCode must not download application updates or provider
   configuration from the vendor at runtime. What the user built is what runs.
2. LiteLLM (a self-hosted, OpenAI-compatible proxy) is a first-class provider
   template, and models can be loaded from the proxy instead of typed by hand.

Non-goals: removing login, plugin marketplace browsing, or vendor-hosted model
providers. Those are user-initiated and keep working.

## 2. Product rules

### 2.1 Remote updates switch

- A single build-time constant `ZCODE_REMOTE_UPDATES_ENABLED`
  (`packages/shared/src/env.ts`) is the only owner of the decision. It is `false`
  in this repository. It is not read from the environment, so it cannot be
  turned back on without rebuilding.
- When `false`:
  - **App auto-update** (`packages/desktop/src/main/autoUpdater.ts`) is
    initialised with `enabled: false`. Every entry point that could reach
    `electron-updater` (poll, manual menu check, release-channel refresh, force
    update) fails closed without a network request.
  - **Force-update gate** (`forceUpdateGuard.ts`) is not consulted, so startup
    never waits on, or is blocked by, a vendor `minimalVersion`.
  - **Built-in provider config** is read only from the bundled file
    (`config/provider/zcode-builtin.json`, or `ZCODE_BUILTIN_PROVIDER_CONFIG_FILE`).
    No `/api/v1/client/configs` lookup, no CDN download, no 60 s refresh timer.
    The Active/LKG cache under the app config directory is **not read**, so a
    cache written by an earlier vendor build cannot override the bundled file.
    The bundled path itself is handed to Host and Agent processes as the
    Active path.
- When `true`, behaviour is identical to upstream.

### 2.2 LiteLLM template

- Template id `litellm`, display name `LiteLLM`.
- API type `openai-chat-completions`, default base URL `http://localhost:4000/v1`
  (LiteLLM's default port). The user edits the base URL per provider.
- Access `api-key`. LiteLLM accepts any key when auth is off; the schema still
  requires a non-blank key, so users without auth enter any placeholder.
- No built-in model ids: LiteLLM model names are user-defined aliases.
- Model configuration for imported ids comes from the existing rule chain
  (catch-all `.*` rule plus name-pattern rules); users may switch any model to
  manual configuration as today.

### 2.3 Remote model discovery

- Available on personal providers whose saved API type is
  `openai-chat-completions` or `openai-responses` (LiteLLM, OpenAI, and any
  OpenAI-compatible endpoint). Hidden for other API types.
- Uses the **saved** provider config (base URL, API key). Unsaved draft input
  is not used; the user saves first (fields save on blur).
- Request: `GET {baseUrl}/models`, header `Authorization: Bearer <apiKey>`,
  `redirect: "error"`, 15 s timeout, 2 MB body limit. The key is never logged.
- Response: OpenAI list shape `{ "data": [{ "id": string }, ...] }`. Ids are
  trimmed, de-duplicated, and sorted. Anything else is `invalid-response`.
- UI: a "Load models" button in the provider's model section opens a dialog
  listing ids not already on the provider, all pre-selected. "Add" adds the
  selected ids one by one through the existing `addPersonalModel` path with
  recommended (rule-based) config. Ids already present are never re-added.
- Failure codes surfaced to the UI: `unsupported-api-type`,
  `provider-not-found`, `missing-base-url`, `missing-api-key`, `timeout`,
  `network`, `http-<status>`, `invalid-response`.

## 3. Ownership and interfaces

| State / decision                  | Single owner                                        |
| --------------------------------- | --------------------------------------------------- |
| Remote updates on/off             | `ZCODE_REMOTE_UPDATES_ENABLED` (shared, build-time) |
| Built-in provider config contents | Bundled file (no remote layer when switch is off)   |
| Saved provider base URL / key     | Personal provider config (unchanged)                |
| Discovered model list             | Transient; owned by the open dialog, never stored   |
| Provider model membership         | Personal provider config via `addPersonalModel`     |

New interface on `IProviderSettingsService`
(`packages/services/src/model-provider/providerFacadeServices.ts`):

```ts
listRemoteModels(input: { providerId: ProviderId }): Promise<ProviderRemoteModelsResult>;
// ProviderRemoteModelsResult =
//   | { ok: true; modelIds: string[] }
//   | { ok: false; code: ProviderRemoteModelsErrorCode; message: string }
```

It runs on the Host that owns the provider settings (the same Host the UI is
already talking to, local or remote), so the request originates where the
provider config lives. The RPC proxy forwards it without registration.

## 4. Event order: model discovery

```text
UI (dialog)                  Host: IProviderSettingsService           LiteLLM
   │ click "Load models"            │                                    │
   │──listRemoteModels(id)─────────▶│ waitForProviderOperations(id)      │
   │                                │ read saved effectiveConfig         │
   │                                │──GET {baseUrl}/models─────────────▶│
   │                                │◀──{data:[{id}]}────────────────────│
   │◀──{ok, modelIds}───────────────│                                    │
   │ user selects, clicks "Add"     │                                    │
   │──addPersonalModel(id, m1)─────▶│ write personal config (serial)     │
   │──addPersonalModel(id, m2)─────▶│ …                                  │
```

Stale-result rule: the dialog is keyed by provider id; closing it drops any
in-flight result. Adds are serial and stop at the first failure, reporting how
many were added.

## 5. Acceptance scenarios

1. Fresh build, start desktop: no request to `/api/v1/client/configs`,
   `/api/v1/releases/electron/manifest`, or the provider-config CDN.
2. An Active cache file with a higher revision exists in the app config
   directory: the provider list still matches the bundled file.
3. "Check for updates" in the app menu reports updates are unavailable and
   makes no network request; toggling "receive preview updates" makes none.
4. Add provider → template picker shows "LiteLLM" → base URL defaults to
   `http://localhost:4000/v1`.
5. With LiteLLM serving `gpt-4o` and `claude-sonnet`, "Load models" lists both;
   "Add" adds both; reopening lists nothing new.
6. Wrong key → dialog shows `http-401`; proxy stopped → `network`; hang →
   `timeout` after 15 s.
7. Provider with API type `anthropic-messages`: no "Load models" button.

## 6. China egress block

Rule: no process we start may open a network connection to a China-operated
service. This replaces the earlier "vendor contact that remains" exemption.

- Single owner: `CHINA_EGRESS_BLOCKED_HOST_SUFFIXES` and `isChinaEgressBlockedHost`
  (`packages/shared/src/egressPolicy.ts`). Blocked: the vendor (`z.ai`,
  `bigmodel.cn`, `zhipuai.cn`), Alibaba Cloud (`aliyuncs.com`, `aliyun.com`,
  `alicdn.com`, `alibabacloud.com`, `aliyunga*.com`, `initaa.com`,
  `cdngslb.com`, `yundunwaf*.com`), Tencent (`qq.com`), ByteDance Lark
  (`larksuite.com`), Chinese model APIs (`deepseek.com`, `minimaxi.com`,
  `minimax.io`, `xiaomimimo.com`, `npmmirror.com`), and every `.cn` host.
- Node processes (CLI/agent, desktop main, host, scheduler): `installChinaEgressGuard()`
  (`@zcode/shared/node`) runs first in each entry and rejects
  `net.Socket#connect` to a blocked hostname before DNS. This covers `fetch`,
  `http(s)`, `tls` and WebSockets. The connect fails with
  `ZCODE_EGRESS_BLOCKED`.
- Electron sessions (renderer, webviews, Electron `net`): every session cancels
  requests to blocked hosts via `webRequest.onBeforeRequest`.
- Telemetry: `ZCODE_TELEMETRY_ENABLED` is `false` at build time, so ARMS and the
  data-warehouse reporter stay off even if their endpoint env vars are set.
- Consequences (accepted): z.ai/BigModel login and models, the official plugin
  marketplace and icons, WeChat/Feishu bots, Chinese model providers and the
  desktop feature-flag check all fail closed. LiteLLM, OpenAI, Anthropic,
  OpenRouter, GitHub and localhost are unaffected.
- Out of scope: commands the agent runs in a shell (`curl`, `git`, MCP servers);
  they are separate programs and follow the user's own network setup.
- Build time still downloads Electron and electron-builder binaries; use the
  official GitHub release mirrors:

```bash
ZCODE_SKIP_REMOTE_ASSETS=1 \
ELECTRON_MIRROR=https://github.com/electron/electron/releases/download/ \
ELECTRON_BUILDER_BINARIES_MIRROR=https://github.com/electron-userland/electron-builder-binaries/releases/download/ \
pnpm bundle:desktop -- --os mac --arch arm64
```

Acceptance: a CLI prompt through LiteLLM succeeds and logs only localhost
connections; `fetch("https://zcode.z.ai")` inside a guarded process rejects with
`ZCODE_EGRESS_BLOCKED` without a DNS lookup; `https://example.com` is unaffected.

## 7. Local-only: no vendor accounts

Purpose of this fork: work with local LLMs (LiteLLM, localhost, LAN). Vendor
accounts can never work behind the §6 egress block, so they are removed rather
than left as dead ends.

- Single owner: build-time constant `ZCODE_VENDOR_ACCOUNTS_ENABLED = false`
  (`packages/shared/src/env.ts`).
- Bundled provider config ships no `account:*` providers (Z.ai/BigModel coding,
  start and off-peak plans) and no templates for China-operated APIs (Z.ai,
  BigModel, Kimi, MiniMax, DeepSeek, Alibaba Qwen, Xiaomi MiMo). Their model
  rules go with them. Non-Chinese templates (OpenAI, Anthropic, xAI,
  OpenRouter, OpenCode, LiteLLM) and custom providers stay.
- CLI: `zcode login`, `zcode logout`, `/login` and `/logout` answer
  "not available in this local-only build" and exit non-zero; help text no
  longer lists them.
- Desktop: the welcome/login screen never opens (all open reasons are inert)
  and the account "Connect" entry is hidden. Users add providers in
  Settings → Model settings.
- Existing credentials files are left untouched (no migration, no deletion).

Acceptance: `zcode login zai` prints the local-only message without network
activity; `zcode --help` lists no login commands; the provider picker shows no
Zhipu group; the desktop starts straight into the workspace.

## 8. Migration boundary

Re-enabling remote updates means flipping the constant and rebuilding. A
vendor release with a higher revision would then replace the bundled templates,
including removing `litellm` until the vendor ships it; personal providers
created from it would report `missing-template`.

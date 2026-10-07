# ZCode Beyond notice

ZCode Beyond is a modified version of ZCode by the ZCode authors
(https://github.com/zai-org/ZCode), licensed under the Apache License, Version 2.0
(see LICENSE). Modifications by Can Guldogan and contributors, 2026; the change
history is the git log of this repository. ZCode Beyond is not affiliated with or
endorsed by the ZCode authors, and "ZCode" remains the name of the original product.

The original ZCode notice follows unchanged.

---

# ZCode Feature Notes and Third-Party Component Notices

This notice applies to the source code published in this repository and its build artifacts.
Each runtime form (Desktop, Web, CLI, remote) differs in functionality, permissions, storage
locations, and network behavior; the default settings of one form must not be read as the
uniform settings of the whole project.

## 1. AI output, execution permissions, and automation risks

AI-generated code, commands, explanations, files, and suggestions may contain errors, omissions,
security flaws, or third-party rights issues. Verify them against actual files, command exit
statuses, tool results, and tests; a model claiming something is "done", "handled safely", or
"authorized" is not proof of fact or authorization. Before important operations, review the
execution target, recipients, and impact, and keep recoverable backups.

File, terminal, Git, and Agent tools and external processes can read and write files, start
processes, and access the network within the OS account permissions under which they actually
run. In Web or remote workspaces, operations may happen on a server, SSH host, WSL instance, or
container; the device showing the current page does not determine where execution occurs. The
current shared Agent execution adapter provides no default OS sandbox; the working directory,
workspace identity, Git worktree, browser page isolation, and the Node REPL's runtime context
must not be treated as system-level isolation guarantees for all tools.

The shared runtime configuration defaults to the `build` permission mode; the standalone CLI
running non-interactive tasks via `--prompt` falls back to `yolo` when `--mode` is not
specified. Interactive sessions, desktop sessions, resumed tasks, and hosts may each use their
own configured, saved, or passed-in mode. Whether each action is confirmed depends on tool
declarations, permission rules, and the run mode; `yolo` without a read-only planning constraint
allows ordinary tool operations, while interactive tools and tools that explicitly require
confirmation still follow their own rules. Model tool approval is not a global permission switch
for the whole app, and terminal operations, plugin processes, or update downloads must not be
assumed to pass through the same approval flow. See [CLI prompt modes](apps/zcode-cli/packages/cli/src/run.ts#L486)
and [tool permission decisions](apps/zcode-cli/packages/core/src/permission/service.ts#L97).

| Capability or hook                        | Possible impact and boundaries                                                                                                                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Files, Git, terminal, shell, Node REPL    | Can read/write or delete data, run programs, and access the network; Git, package managers, and user commands may also trigger their own scripts and hooks. Task snapshots, Git checkpoints, and session resume are no substitute for backing up all local files, databases, and external services. |
| User and workspace instructions, skills   | Workspace instruction files, skill text, templates, and scripts influence model plans; reading, installing, or displaying them does not mean the content is trustworthy, lawful, or officially security-reviewed.                                       |
| Lifecycle hooks                           | `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PostToolUseFailure`, and `Stop` can trigger commands or processes. Inputs may include prompts, working paths, tool arguments, tool results, and replies; hooks can also inject context, rewrite tool input, or take part in permission decisions. |
| Workspace hook trust                      | Workspace hooks are vetted by workspace identity and a declaration digest; changes to the declaration invalidate the previous trust. This mechanism is not a unified review of plugin hooks, MCP configurations, or other project scripts.               |
| Plugins and MCP                           | Enabling a plugin can bring in auto-executing hooks, local programs, and remote tools. The current Agent runtime configuration includes workspace-level MCP servers in automatic connection; when MCP is enabled and the runtime starts, commands, environment variables, auth headers, or OAuth from the configuration may be used to connect to services. Plugin hooks and workspace hooks go through different admission paths. |
| Startup and install scripts               | To obtain a shell environment, Desktop or terminal launches may run login shells and their startup configurations; dependency installation can also run lifecycle scripts such as native module builds. Such scripts may run before the model's task and must not be assumed to execute only commands the model approved item by item. |
| Subagents, workflows, and background tasks| They can keep calling models, executing commands, and incurring costs or external side effects. Stopping a session, switching pages, or canceling a request does not undo completed file writes, publications, uploads, or other external operations.      |
| Desktop scheduled and off-peak tasks      | They run according to their stored configuration while the scheduler and execution host are available, and may continue after the window is hidden. Closing a window may merely hide it to the background or tray; explicit quit, sleep, network loss, and account or model unavailability can all affect execution. There is no guarantee that tasks run after shutdown or that missed tasks are replayed; the standalone CLI does not gain a persistent scheduling service merely by including the Cron tool. |
| Embedded browser and Browser Use          | Can access web pages, read page content, screenshot or record pages, and perform clicks, input, uploads, and downloads. Browser login states imported or reused through user actions may allow access to private data, form submission, or changes to remote accounts; visiting a web page itself also communicates with the site and the services it loads. |
| Computer Use                              | The Computer Use package shipped in this repository is a non-functional placeholder; calls return an unavailable error and no system screenshot or control capability is provided. See [Computer Use entry](packages/zcode-cua/index.js#L3).             |
| Web services and remote run environments  | Network reachability, login authentication, process account, and file permissions are determined jointly by the specific deployment. Authentication defaults vary by launch entry and listen address; local listening, origin checks, and SSH tunnels each control different boundaries — a dev server or local core port must not be treated as a service fit for public exposure. |
| Content sharing, import, and resource preview | May read or transfer conversations, code, attachments, and generated artifacts. Imported shared context, web pages, and files are external input; a source displayed as a ZCode link does not make it a trusted instruction or grant copyright over its content. |

Web pages, repository content, tool return values, and third-party instructions may contain
content that induces the model to take additional actions. When handling untrusted projects,
restrict the running account, credentials, and network permissions, and review sensitive
operations.

When self-hosting the Web or remote services, configure authentication, transport protection,
and access control according to the actual entry points; app account login is not a substitute
for deployment-layer security boundaries. For Web launch parameters and authentication, see
[README run instructions](README.md#zcode-cli-distribution). The standalone remote service core accepts
only loopback listen addresses and provides no equivalent external account authentication.
HTTP/WS, HTTPS/WSS, and SSH have different protection guarantees; not all deployments are
encrypted by default, and remote hosts or service operators may be able to access the data they
process. For remote-core restrictions, see [listen rules](packages/zcode-server-cli/src/server-core/http.ts#L115).

## 2. Upload interfaces, outbound requests, and business purposes

| Scenario                                        | Purpose, triggers, and data scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model and auxiliary model requests              | Task execution, compaction, titles, memory, history extraction, goal-completion verification, AI Git commit message generation, and model connectivity tests may call models; some auxiliary calls are triggered automatically with the task. Relevant prompts, history, code, diffs, tool results, or attachments are sent, with scope varying by feature; connectivity tests use a fixed probe message. Requests may also carry auth information, client environment, and session/request/trace identifiers; Anthropic-compatible calls add device and session identifiers. The recipient depends on the actual endpoint, gateway forwarding described below, and proxy configuration — the SDK name alone does not determine it. |
| Login, authorization, accounts, and API credentials | Login, authorization code exchange, login-state polling, and account/entitlement queries may send authorization state, codes, access tokens, polling credentials, and client identifiers. After login or account configuration parsing, project API keys may be queried, fetched, or created automatically, and subscribed team projects may also create missing keys during price refreshes. The embedded plan page can pass login credentials, language, and theme to pages that pass origin checks, and provide device identifiers, account identifiers, and app version. The current built-in account adapter does not implement refresh token exchange; for MCP OAuth auto-refresh see "MCP connections, OAuth, and tool calls". Account authentication proves access identity; it does not mean every subsequent send has separate user confirmation. The internal processing of external authorization pages has not been verified in this repo. |
| Plans, orders, payments, and quota              | Quota resets and related status syncs may send account credentials, personal or team/project scope, reset type, and idempotency identifiers to business services; quote requests, status polling, and read-receipt redemption can trigger automatically. The repository provides registered order quote/create/cancel, renewal, payment method management, and payment services; calling them may send product, order, payment method, or authorization identifiers, amounts, subscription options, and caller-provided channel or tracking fields. The existence of a service method does not mean every distribution ships a purchasable UI, nor that opening a page initiates payment. |
| Official Coding Plan model gateway forwarding   | Two official Anthropic-compatible model endpoints are matched by protocol, host, valid port, and path as listed in code; on a match, requests are automatically redirected to the ZCode gateway, preserving the method, body, query parameters, and all headers except Host, including the request's authentication information. The actual gateway origin can be changed via ZCODE_BASE_URL/ZCODE_ENDPOINT_ORIGIN. This forwarding has no additional per-request user confirmation; the decision is based on the request URL — a provider created by the user does not imply the gateway is bypassed. The gateway's internal processing after receiving a request is outside what client source can verify. |
| Providers, business configuration, and connectivity checks | Background checks after startup, configuration refreshes, service checks, or related page activity may access provider catalogs, business configuration, help content, and CDNs, sending the request URL, version, platform, and per-API origin information; help configuration requests may also carry device identifiers, and service connectivity checks may carry configured auth headers. Provider catalog downloads and public configuration reads do not inherit control-plane authentication. Some requests run independently of model tasks and do not require manual refresh each time. Model connection tests go through the model request path instead; the existence of a check service method does not mean all checks run automatically at startup. |
| Search, web processing, and remote resources    | Model tools, user page visits, or resource display may send queries, URLs, request headers, and ordinary network information to model providers, target websites, and resource services. WebSearch currently runs through model providers with native search support; content fetched by WebFetch may also be sent to the model together with the processing prompt — downloading a web page must not be read as later local-only processing. Receivers of web pages, plugin marketplace images, and other remote resources learn the access request and information such as IP. |
| MCP connections, OAuth, and tool calls          | With MCP enabled and configurations loaded at runtime, the client may automatically connect to services declared by the workspace or plugins, negotiate protocols, and discover tools; OAuth may also perform discovery, client registration, authorization exchange, and automatic token refresh. Tool calls send arguments and may automatically attach workspace absolute paths, workspace identity, session/turn/trace and remote session identifiers. HTTP/SSE sends to the configured service; stdio is handed to a process on the local or execution host machine, whose subsequent network behavior depends on that program. Tool approval does not uniformly cover connection, discovery, and refresh flows. |
| SSH/WSL/containers and other execution environments | After a connection is established or a task starts, protocol commands, prompts, files, attachments, tool results, and terminal state may be passed across environments. Personal provider configurations, account selection settings, and sync-permitted account API keys and OAuth access/refresh tokens are automatically forwarded to the target environment when it first comes online and when related configuration or credentials change during the connection; this sync has no separate per-credential confirmation step. SSH involves network transport; WSL/containers may also use file copies or process input; these transfers do not necessarily go to the official cloud. |
| Skills, MCP, plugin, and configuration sync     | When selected and synced from the settings UI, skill or plugin directories, supporting files, marketplace sources, and configuration may be sent to the target environment; service interfaces can also be invoked directly by callers. Skill sync may include files in the selected directories; MCP configuration may include command arguments, environment variables, request headers, authentication information, and local paths. Some plugin options have sensitive-field filtering, but that is not comprehensive secret detection of directory archives and all configuration. |
| Attachment transfer and media preview           | Files, images, or text can come from pickers, drag-and-drop, paste, and task output. Once attachments are in the input area with an execution session available, pre-transfer may start before the send button is clicked, and resuming a session may continue processing the queue. Local file paths can be referenced directly without uploading; the receiver of chunked protocol uploads or remote pre-transfer is the execution host. Remote media preview may also read data back from that host to the local machine. Such local or cross-environment handling is not public publishing; content may still enter model or sharing paths as part of the task. |
| Session sharing, browsing, and import           | Sharing submits the public projection of selected session rows and materializable attachments to the share service, including user text, model replies and reasoning text, tool input/output, and related metadata. Selection may first query share-service capabilities; that capability request does not send session projection content. The normal UI publish flow requires a disclosure confirmation first, and the service validates the submitted confirmation time before creating a preparation record, uploading attachments, and finally submitting the publish confirmation; attachments may therefore be sent before final publish succeeds, but the prepare/upload steps happen after the service's disclosure validation. The current UI defaults to public and importable; browsing and importing do not require a publish checkbox. The confirmation-time field does not prove every caller went through the UI checkbox. Browsing and importing send the share code and available credentials and access attachment download URLs; importing also sends a request identifier. Projection filtering and text processing are not comprehensive secret detection; local deletion or cancellation does not guarantee externally uploaded copies or recipient copies are deleted. |
| Off-peak task tickets and status sync           | Availability queries, ticket queueing, ticket status sync, and redemption send task identifiers, ticket identifiers, source/request identifiers, Coding Plan identity, and authentication information. With pending tickets or similar conditions, background sync may keep polling; such requests do not send the full task prompt — actual model content goes through the model path separately. |
| Proactive feedback, supplementary messages, and diagnostic attachments | When a user submits the feedback form, the body, contact details, account and client information, screenshots, and file names may be sent. The service also provides supplementary message and attachment upload interfaces, and background tasks use the message interface to report upload results; the existence of an interface does not mean the current UI offers a follow-up editing entry. After ticket creation succeeds, the form can be collapsed while screenshots and selected logs continue uploading via background tasks; quitting the form before creation succeeds requests cancellation. Attachments first request an upload credential from the feedback service, then upload directly to the returned object storage address. Desktop logs are unchecked by default; when checked, diagnostic log files are selected by local same-day modification time and archive rules and processed in full — entries are not guaranteed to be from the current day only. Leaving logs unchecked does not affect the body or other attachments, and text processing does not guarantee screenshots or arbitrary files are redacted. |
| Installation, plugin acquisition, remote deployment, and updates | Install, discovery, authentication, deployment, and updates access repositories, package services, plugin marketplaces, CDNs, or update servers; the unified CLI install script reads a version manifest from the configured distribution source and downloads release packages. Desktop auto-update depends on distribution form and run conditions; when enabled it may request update manifests at startup and on periodic checks, carrying platform, channel, device, and similar information, where platform values can distinguish architecture and version information affects update selection. Packaged builds ignore update-source overrides from the `ZCODE_UPDATE_FEED_URL` environment variable and the `--zcode-update-feed-url` launch argument; these two override entry points exist only for development builds. Downloaded code may subsequently be installed or executed, and remote deployment may also upload/copy existing or downloaded components to the target environment. Download checks, actual installation, and running components have different control conditions and must not be uniformly described as confirming before every step. |
| Delivery or publishing by tools, hooks, workflows, and automated tasks | Shell, terminal, Git, Node REPL, browser, plugin, MCP, or workflows can read data involved in the task, upload files or artifacts to the relevant target services, and change external service state; lifecycle hooks and configured scheduled/background tasks can also trigger programs. Permission rules, modes, plugin configuration, and system accounts determine the execution scope; there is no guarantee that every outbound item was selected by the user or that every outbound action has separate confirmation. After publishing, sending, purchasing, or deploying, local cancellation or revocation may not restore external state. For permission boundaries see section 2. |
| Development testing, debugging, and request recording | When the relevant development tools are run explicitly, test prompts, sample materials, and auth headers may be sent to configured real model or tool services; a recording proxy configured with a real upstream can forward requests — a name containing test/record does not mean fully offline. Request traces and debug files may also store model content locally; these tools' trigger entry points differ from normal product runs. |
| Building, signing, and maintainer releases      | When install, build, or release scripts are run explicitly, dependencies, native binaries, and runtimes may be downloaded, build materials copied to the release share directory, Git pushed, or materials handed to signing tools and Apple notarization. External signing tools and separately configured CI, storage, and distribution services have their own network behavior; processes not spelled out in this repo must not be assumed verified from script names alone. These calls have different entry points, environments, and credential requirements. The CLI SEA share-directory release and upload first validates third-party notice materials; validation failure blocks that release flow. The current native-search preparation step validates and unpacks repository-bundled archives per target platform and does not download those archives; other components such as Node have their own download paths. |

The business purposes above describe the interfaces provided by this project. User-written
scripts, arbitrary configured addresses, or separately installed third-party components may
have additional data-sending behavior; launching something through ZCode does not mean its
purpose or recipients have been officially reviewed.

## 3. Local data, logs, and credentials

Data may be stored separately on desktop devices, in browsers, on CLI hosts, in SSH/WSL
environments, and in external services. Desktop and server data directories are affected by the
run environment and launch configuration and contain settings, sessions, attachments, caches,
task records, plugins, and logs; the standalone CLI's default session database is at
`~/.zcode/cli/db/db.sqlite`. Closing a window, logging out, uninstalling the client, or deleting
a workspace must not be read as having erased all copies in other environments, standalone data
directories, backups, and external services.

Memory features differ in defaults and entry points: the standalone CLI enables memory in its
default configuration, while the desktop app defaults it off. When enabled, saved sessions can
be analyzed, memories persisted, and reused in later tasks; related extraction or organization
may generate additional model requests. Automation plans, run records, and unfinished tasks
also have their own persistence locations; restoring these records does not guarantee that
previous external operations were undone or can be fully replayed.

The shared Agent's model input/output logs are written locally by default in development and
production runs, except in test environments. Logs may contain prompts, code, context, tool
arguments, and model replies; request headers and some image/video data are redacted, but not
all user text should be assumed redacted. Production defaults to rotation and trimming;
explicitly enabling full retention changes that behavior. The desktop main process, host,
scheduler, web service, and remote daemon each have their own logs and crash records; a single
log's size cap does not set a uniform retention period for the project.

Credential storage mechanisms also differ: the CLI shared credentials file uses encryption
whose default key can be derived from local environment information, and its reading logic also
accepts plaintext records; desktop/Node service credentials likewise use locally encrypted files
with configurable or environment-derived keys, not the system keychain; Web OAuth credentials
may be stored in localStorage. Model configuration, environment variables, plugin/MCP settings,
SSH configuration, and remotely synced data may also contain valid credentials — none of these
stores should be treated as a system keychain, hardware isolation, or a "never leaves this
machine" guarantee.

The embedded browser uses persistent browsing data; explicitly importing Cookies and
LocalStorage from other browsers gives it the corresponding login states. Clearing the cache
and clearing all site data are different operations, and browser history, downloaded files, web
recording artifacts, and model logs are not necessarily removed by the same cleanup entry
point. Do not put real keys or tokens into version-controlled files. Before copying logs,
uploading feedback, sharing conversations, or backing up data directories, check who will
receive them to avoid submitting real credentials, raw sessions, or private project content to
public repositories or issue reports.

## 4. Third-party licenses and copyright notices

First-party code in this repository is licensed under Apache-2.0 per the root
[LICENSE](LICENSE); that license grants no additional rights on behalf of other rights holders
and does not cover the separate terms of third-party software, copied code, native binaries,
fonts, icons, web assets, and other resources. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)
for the specific dependency packages. Due to third-party copyright, licensing, and
redistribution conditions, no promise is made to provide all features and campaign policies of
the official product; the actually published source code and build artifacts govern.

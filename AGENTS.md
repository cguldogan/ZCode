## Core principles

- Before adding or changing behavior, update the corresponding spec first; create the directory on demand if it does not exist. Nail down product rules, state owners, interfaces, and acceptance scenarios before writing code.
- Treat the currently checked-out source, `package.json`, and the architecture policy as authoritative. Keep only the features, commands, and files the current repo provides in these instructions; when removing a feature, clean up references in instructions and skills too.
- When investigating an issue, do not modify code until asked; investigate the cause first. Combine source, logs, and runtime evidence to separate confirmed causes from unverified hypotheses.
- Preserve local changes unrelated to the task; do not restore removed modules or internal dependencies on your own.

## Commands and repo structure

Run `node scripts/check-workspace-freshness.mjs` to check the baseline before starting. Node version follows `mise.toml`.

The following commands run from the repo root:

| Purpose                    | Command                                   |
| -------------------------- | ----------------------------------------- |
| Typecheck                  | `pnpm typecheck`                          |
| Lint                       | `pnpm lint` / `pnpm lint:fix`             |
| Format check               | `pnpm fmt:check`                          |
| Desktop development        | `pnpm dev:desktop`                        |
| Web development            | `pnpm dev:web`                            |
| Pre-commit checks          | `pnpm verify:pre-push` (lint + architecture) |
| Architecture check         | `pnpm architecture:check --changed`       |
| Module reading package     | `pnpm architecture:context <module-id>`   |
| Unused deps and exports    | `pnpm knip`                               |
| Export reference lookup    | `pnpm dep:refs --list-exports <file>`     |

For test entry points, defer to each target package's current `package.json` and actual test files; do not assume a unified unit-test or E2E command exists.

- `packages/desktop`: Electron main, host, renderer.
- `packages/web`, `packages/server`: Web client and server.
- `packages/ui`: shared React components, hooks, and Zustand stores.
- `packages/services`: business services; `packages/rpc`: RPC framework.
- `packages/shared`: shared protocols and types; `packages/client`: Agent client SDK.
- `apps/zcode-cli`: Agent CLI and runtime.
- `CONTEXT.md`: plugin-store domain vocabulary; read it before touching related UI.
- `DESIGN.md`: UI design spec; read it before touching UI.

## Implementation and verification

- For code changes use `.agents/skills/architecture-governance/SKILL.md`: run the architecture check first, then read the governed context of the target module.
- Avoid duplicated state and multiple write paths. Make the single owner, interfaces, dependency direction, event ordering, and idempotency boundaries explicit; never mask sync problems with timeouts.
- Add corresponding tests for behavior changes; interaction changes need E2E scenarios. Check that tests match the implementation, and actually run the available verification. State honestly what you did not run or could not run due to environment limits.
- When fixing bugs, explain the cause and the fix rationale in code comments. When you find a design flaw, align with the user first instead of piling on fallback branches.
- For designs involving state, timing, remote, or async sync, use a diagram to show owners and event ordering.
- You must run `pnpm typecheck` and `pnpm lint` and report the real results; never report pre-existing failures as passing.
- Use async file and network IO; import across packages via public entry points and respect existing path aliases.
- UI must not call Repos directly, Services must not reference Runtime concrete implementations, cross-domain imports of implementation details and circular dependencies are forbidden.

## UI and platform boundaries

- Follow `DESIGN.md`, reuse existing components, and account for layout, interaction, theming, and i18n on both desktop and mobile web.
- Components access services through `packages/ui/src/hooks/`; platform operations go through `IPlatformService` (`packages/shared/src/platform.ts`) — never call `window.zcode` directly.
- Handle differences between Desktop, Web, local, and remote environments via dependency injection, and support Windows, macOS, and Linux.
- Zustand state lives in `packages/ui/src/store/`. Broadcast-synced fields such as topic and language must guard against feedback loops; UI-local state must not be mistaken for server-side truth.
- Files containing JSX in hooks use the `.tsx` extension.

## Processes, protocols, and remote control

- The Desktop app talks to the Agent over stdio. When changing the protocol, update `packages/shared/src/zcode-protocol/index.ts` in the same change, with strict types and runtime validation.
- Main handles windows, native operations, process scheduling, and message forwarding; it carries no task/session business state.
- Each window uses one window-scoped Local Host; local workspaces share that Host. Remote workspaces are managed by a connection registry inside the window — no separate Desktop Remote Host.
- Phone remote control attaches to the Desktop's existing Host attachment and reuses the session runtime; never spawn a separate Agent, Local Host, or remote session for the phone.
- Desktop's `desktop-continuous` live stream and the phone's `web-remote-replayable` recovery stream are distinct semantics and must stay clearly separated. When changing stream, snapshot, queue, or reconnect logic, verify both semantics.
- The external relay and Main only do authentication, pairing, heartbeats, forwarding, and attachment scheduling; they store no business state such as task queues or snapshots.
- Accepted busy/running input goes through serialized admission by the CLI/runtime `CommandInbox`; the Renderer keeps only uncommitted drafts and pending optimistic overlays, and the Host owner/lease handles routing.
- Keep the owner/lease, cross-Host routing, and stale-run guards; never delete a boundary based on a single observed path alone.

## Workspace Identity

- `workspaceIdentity` is for identity isolation; `workspacePath` is for file operations, command cwd, Git, and path display.
- The identity key is uniformly `workspaceIdentity?.trim() || workspacePath`, for deduplication, binding, caching, queues, persistence, and request correlation.
- Remote links pass `workspaceIdentity` and `remoteSessionId` end to end; never match by path alone.
- New interfaces keep the local-path fallback; remote identity reuses existing construction and parsing utilities — never hand-write the format in business code.

## Logging

- UI uses `packages/ui/src/logger.ts`; never use `console.log` or `window.zcode?.log` directly.
- Agent/session/runtime service logs use `createServiceLogger(scope)` (`packages/services/src/logger/serviceLogger.ts`).
- `debug` is for high-frequency diagnostics such as raw protocol data, streaming chunks, and per-item tool updates; it is not persisted in production.
- `info` is for production-relevant events such as process and session lifecycle, permission outcomes, and one-time initialization.
- `warn` is for recoverable anomalies; `error` is for unrecoverable failures such as crashes, handshake failures, and lost authentication.
- Never write credentials, real user data, or internal service addresses into logs, examples, or commits.

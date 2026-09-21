# Agent instructions

This is a TypeScript Node.js coding agent CLI supporting mainstream models and operating
systems. General working rules follow the [root AGENTS.md](../../AGENTS.md); this file adds CLI
rules. Node.js and package manager versions follow the repo-root
[mise.toml](../../mise.toml) and [package.json](../../package.json).

## Working standards (most important)

- Before adding or changing behavior, write or update the corresponding spec first — nail down
  product rules, state owners, interfaces, and acceptance scenarios — then implement. Prefer
  reusing existing docs; create docs and directories on demand when missing, and never assume a
  fixed-version design directory exists.
- Next: test cases matter — they prove whether results match expectations.
- Leave a trail: after adding a feature, leave new documentation; after a bugfix, write the
  bug's cause in a comment.
- Agent-friendly project: keep good logs and interfaces so an agent can fully take over
  operations.
- Long-horizon tasks first: the core agent loop is designed by default for sustainably running
  complex tasks and never hard-stops on tool call count. Resource and safety boundaries should
  be carried by explicit conditions: automatic compaction at token/context limits, user
  cancellation, permission denial, tool timeouts, output truncation, provider retry caps, etc.
- A single source file must not exceed 400 lines by default; beyond that, split modules with
  high cohesion and low coupling first — do not keep piling responsibilities into a big file.
- Extract constants (strings, numbers, etc.) into named variables or constants; do not scatter
  literals through business logic, so a change happens in one place and stays maintainable.
- Before changing database structure, confirm the plan with the module maintainer, covering
  migration, compatibility, and rollback strategy.
- Keyboard operation first: all core logic must be reachable by keyboard. Mouse support is an
  enhancement.

## Tool standards

- Before interacting with the OS, consider Windows, macOS, and Linux simultaneously.
- Keep the default release path as a standard Node.js CLI package.
- Project-specific environment variables use the `ZCODE_` prefix, but do not add environment
  variables casually; before adding one, define its purpose, precedence, error behavior, and
  test coverage in the relevant feature spec. Anything expressible via config file, CLI
  argument, or session config should prefer those over an environment variable.

## Open-source content and sensitive information

- Project license and attribution statements are in the repo-root
  [LICENSE](../../LICENSE), [NOTICE.md](../../NOTICE.md), and
  [THIRD-PARTY-NOTICES.md](../../THIRD-PARTY-NOTICES.md). Before introducing third-party code,
  docs, prompts, or assets, confirm the source, license, and usage rights; keep copyright,
  attribution, and modification notes per the applicable license; never delete still-applicable
  attribution as part of open-source cleanup.
- Docs, examples, test data, logs, and commit messages must not contain real credentials, user
  privacy, internal service addresses, personal working directories, or content not cleared for
  publication; examples use fictional data and placeholder values.
- Before release, verify the actual delivery scope; when Git history is included, check the
  history too. Deletion or replacement in current files does not mean history has been cleaned.

## Cross-platform compatibility principles

- All features are designed by default for Windows, macOS, and Linux simultaneously; never
  implement only the current dev machine's OS behavior.
- Prefer cross-platform Node.js standard library APIs (`path`, `url`, `fs`, …) for path
  handling; never hand-write path separators, absolute path prefixes, line endings, or temp
  directory locations.
- When running external commands, prefer the argument-array form of
  `child_process.spawn` / `execFile`; avoid shell string concatenation, POSIX-only syntax,
  pipes, redirects, or shell built-ins.
- When invoking system commands, editors, shells, package managers, or executables, account for
  Windows `.cmd`/`.exe`, paths with spaces, argument escaping, environment variable casing, and
  shell differences.
- Filesystem logic must account for case-sensitivity differences, permission model differences,
  symlink support differences, executable-bit differences, line-ending differences, and path
  length limits.
- Terminal interaction must be capability-detected, never assuming fixed terminal features;
  color, TTY, Unicode, interactive input, window size, and signal handling all need a fallback
  for non-interactive or capability-poor environments.
- User, cache, config, temp, and project directories must be obtained via explicit
  cross-platform resolution logic; never hard-code Unix-style directory layouts.
- When adding OS-interacting capabilities, add or update tests covering cross-platform
  differences; for behavior that cannot be verified on the current system, state the remaining
  risk explicitly in the implementation and documentation.

## Module boundaries and interface contracts

- Module interactions must go through explicit, limited, stable interfaces.
- Every module should be understandable, testable, and replaceable in isolation, exposing
  strict type declarations, interface definitions, or schema declarations.
- Modules are not directly implementation-coupled; they dispatch each other through
  standardized contracts. Callers must not depend on a callee's internal implementation,
  directory structure, implicit global state, or undeclared conventions.
- A module's exported contract should clearly describe capability, input, output, error shape,
  state changes, and side effects.
- When data crosses process, storage, network, plugin, tool call, or LLM boundaries, prefer
  runtime-validatable schemas over TypeScript types alone.
- When adding module interactions, complete the interface contract before implementing logic.

## Consolidated external I/O boundary

- All external side effects must be uniformly observable, approvable, cancellable, retryable,
  queueable, auditable, and testable. Business logic expresses intent only; it never touches
  the outside world directly.
- All external I/O must be consolidated into explicit infrastructure layers or adapters:
  network requests, filesystem reads/writes, subprocess calls, environment variable reads,
  terminal input/output, caches, databases, the system clipboard, and external service access.
- Except at the entry, infrastructure, and adapter layers, business modules must not call
  low-level I/O APIs such as `fetch`, `http`, `fs`, `child_process`, or `process.env`
  directly; they depend on project-defined interfaces, services, or adapters.
- An I/O adapter must expose stable type declarations or schemas covering input, output, error
  types, timeout, cancellation, retry semantics, idempotency, and side-effect scope.
- Network access goes through a unified request entry point, so timeouts, retries, backoff,
  authentication, proxies, custom certificates, rate limiting, logging, auditing, and error
  normalization are managed centrally.
- File reads/writes go through a unified filesystem entry point, so atomic writes, concurrency
  control, temp files, queued writes, permission errors, path normalization, and cross-platform
  differences are managed centrally.
- Subprocess execution goes through a unified execution entry point, so sandboxing, permission
  approval, environment variables, timeouts, cancellation, output truncation, streaming output,
  and exit code normalization are managed centrally.
- When an I/O operation needs asynchronization, queueing, retries, degradation, or auditing,
  handle it at the I/O boundary layer — never scatter those mechanisms into business logic.

## Tool and side-effect contracts

- Every tool declares an explicit `inputSchema`, `outputSchema`, whether it is read-only,
  whether it is destructive, whether it is concurrency-safe, max output size, timeout,
  cancellation semantics, and permission requirements.
- A tool's side-effect scope is declared explicitly, e.g. `none`, `workspace`, `git`,
  `network`, `system`. The permission system, sandbox, and approval flow read these
  declarations instead of guessing at call sites.
- Tools with side effects should declare idempotency and recovery strategies where possible, to
  enable later retry, rollback, queued execution, and failure recovery.
- Large tool results must not be fed back into model context directly; persist them to disk or
  artifact/storage and return only a summary, preview, and traceable reference.
- External extensions such as MCP, plugins, and subagents must integrate through capability
  declarations, schema validation, namespace isolation, and permission gating — never by
  directly obtaining internal module implementation abilities.

## Sessions, configuration, and observability

- The coding agent CLI treats session, message, tool call, permission, checkpoint, queue, and
  pending states as first-class state objects, supporting resume, fork, rollback, and
  concurrent sessions.
- The TUI handles only input capture, layout rendering, and transient interaction state such as
  cursor, input box, scroll position, and current dialog selection; business state such as
  session, mode, model, tool, todo, permission, and checkpoint must never live in the TUI
  layer — it is stored by server/bootstrap/core/session and delivered via explicit interfaces
  or session events.
- Collapse/expand indicators in the TUI are uniformly `+`/`-` (`+` collapsed, `-` expanded);
  never use `v` and `>`.
- User-facing confirmation, selection, input, progress, and error recovery should be designed
  as stable interaction request/response interfaces or session events serving both the TUI and
  ZCode Protocol V4 clients; different clients are merely presentation and transport adapters —
  never hard-code interaction flows into a single frontend.
- All task execution carries a propagating `traceId`. A `traceId` corresponds by default to the
  complete task chain of one top-level session; child sessions, subagents, retries, background
  queue tasks, and async I/O created within the session all belong to the same `traceId`.
- `traceId` sits above `sessionId`; `sessionId`, `turnId`, `messageId`, `toolCallId`, `spanId`,
  `parentSpanId`, etc. are structured sub-identifiers under the `traceId`, used to reconstruct
  the complete call chain.
- All modules, services, adapters, tool runtimes, provider clients, I/O adapters, and
  permission logic receive and propagate the unified execution context; never drop, overwrite,
  or generate an unrelated `traceId` mid-flight.
- Any async task, tool call, external I/O, cross-module call, or child session that cannot be
  correlated to a `traceId` counts as unobservable behavior and should not be introduced.
- Providers, models, MCP, storage, network proxies, and certificates plug in via adapters;
  session-core never hard-codes a specific vendor, transport protocol, or deployment
  environment.
- Configuration has explicit hierarchy and precedence, e.g. system, user, project, session,
  CLI arguments, and environment variables; security-related configuration must be traceable
  to its source.
- Embrace the `.agents Protocol` and `AGENTS.md` conventions; when designing capabilities such
  as config discovery, config reading, and precedence resolution later, they must be compatible
  with the `.agents Protocol` by default.
- Keep debugging and observability entry points from version one, covering model requests,
  context composition, token/cost, tool calls, I/O, permission decisions, retries, queue
  backlog, and queue drops.
- Logs, traces, and debug output must avoid leaking secrets, tokens, private data, and full
  user content; highly sensitive information must go through an explicit controlled debug path.

## Error handling first

- Errors are first-class design objects. For every new feature, consider failure paths, error
  ownership, propagation, and the end-user message first.
- By default, let errors bubble up until they reach the layer actually capable of handling
  them. Do not swallow errors in low-level modules and continue after logging, and do not
  prematurely convert errors into plain strings.
- Catch errors only when you can recover, retry, degrade, add context, convert to a
  user-actionable message, or at the CLI entry boundary.
- When throwing or wrapping errors, preserve the original cause and add necessary context;
  never lose the call chain or system error information.
- Users can perceive deep system state; error, waiting, retry, permission, model, tool, and I/O
  status should all surface up the call chain to the CLI/TUI and other user interfaces, without
  leaking secrets, privacy, or full raw content.
- Low-level business modules must not call `process.exit`, print errors to the terminal
  directly, or decide the final exit code; the CLI entry layer formats errors, prints messages,
  and sets the exit code uniformly.
- Never branch on error text; when error types must be distinguished, use stable error types,
  error codes, or structured fields.
- Tests must cover key failure paths, especially the CLI's common errors: missing config,
  insufficient permissions, network failures, filesystem anomalies, invalid user input, and
  external command failures.

## Commit conventions

- One separate commit per feature-level change.
- Never mix unrelated features, refactors, dependency updates, and formatting in one commit.
- Keep commits small enough to review independently.
- When one feature's change spans multiple files, commit those files together.
- If a task needs multiple feature-level changes, split it into separate commits in review
  order.

## Verification

- Before finishing a code change, run `pnpm typecheck` and `pnpm lint` from the repo root; for
  CLI code also run `pnpm --dir apps/zcode-cli typecheck` and `pnpm --dir apps/zcode-cli lint`.
- For test entry points, defer to each target package's current `package.json` and actual test
  files; never assume a unified test command exists. Run the corresponding tests for behavior
  changes, and cover E2E scenarios for interaction changes.
- Record honestly which commands were run, their results, and what was left unverified; never
  report missing test entry points, pre-existing failures, or environment limitations as
  passing.

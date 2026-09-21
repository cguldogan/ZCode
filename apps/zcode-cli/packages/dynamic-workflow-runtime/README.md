# @zcode/dynamic-workflow-runtime

Sandbox harness (the dynamic workflow execution engine). Runs a workflow script inside a
controlled child process and bridges the child's `__host.*` calls over NDJSON to the pure
engine core in `@zcode/dynamic-workflow`.

## Dependency boundary

Depends **only** on `@zcode/dynamic-workflow` (workspace) and Node built-ins. **Never** import
`@zcode/core` / `@zcode/contracts` / `@zcode/bootstrap` / `@zcode/adapters` — this package is
the proof that the whole sandbox↔engine pipeline runs app-free.

## Usage

```ts
import { runWorkflowScript } from "@zcode/dynamic-workflow-runtime";

const settlement = await runWorkflowScript({
  scriptText,                 // or lowered: <async function body>
  caps: { maxConcurrency: 16 },
  askSpecs,                   // site id ∈ synthesized schemas record, i.e. typed
  validate,                   // @zcode/dynamic-workflow's validate (adapted to ValidateFn)
  makeDriver: (sink) => driver, // driver carries its own journal + emit; sink is the engine's upward reporting surface
  signal,                     // optional: AbortSignal
  timeoutMs,                  // optional: wall-clock timeout
});
// settlement: { status: "completed", artifact } | { status: "failed", error } | { status: "cancelled" }
```

## Architecture

```
┌─ parent (harness) ──────────────┐  NDJSON  ┌─ child (vm.createContext) ──────┐
│ runWorkflowScript               │  stdio   │ only ES intrinsics + __host     │
│  - lower(scriptText)            │◀────────▶│  createActor returns local      │
│  - WorkflowEngine(driver,...)   │          │    handle synchronously         │
│  - bridges __host.* ↔ engine    │          │  ask/worldRead → request parent │
│  - spawn/kill/timeout/abort     │          │  args freeze globals (cross the │
│                                 │          │    boundary once at spawn)      │
│                                 │          │  Date.now/Math.random banned    │
│                                 │          │    at runtime                   │
└─────────────────────────────────┘          └──────────────────────────────────┘
```

## NDJSON wire protocol

See `src/protocol.ts` (single source of truth). child→parent: `create-actor` (fire-and-forget) /
`request` (ask, world-read) / `event` (log) / `complete`; parent→child: `response`.

## Build order

Tests and typecheck resolve the dependency through `@zcode/dynamic-workflow`'s **built dist**, so
`pretest` / `pretypecheck` first run `pnpm --filter @zcode/dynamic-workflow build`. A fresh
checkout can run `pnpm test` directly and will not trip over a stale dist.

## Failure adjudication and trade-offs

- The run verdict belongs to the engine. Terminal failures (script throws / child crash /
  timeout / protocol corruption) all call `engine.fail(error)` — settlement becomes `failed`,
  the driver cancels in-flight asks, and the journal records `dwf_run.status = "failed"` +
  `failure_json`, so the journal and the caller's result agree. The abort signal is the only
  "true cancellation" and calls `engine.cancel()` (settlement `cancelled`, resumable). The
  harness-side first-wins finalize only handles child-process cleanup (clear timer, close
  stdin, kill child); it never fabricates a settlement of its own.

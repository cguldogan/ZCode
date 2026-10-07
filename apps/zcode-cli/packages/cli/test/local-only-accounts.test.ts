import assert from "node:assert/strict";
import test from "node:test";
import { runLoginCommand, runLogoutCommand } from "../src/login-command.js";
import { LOCAL_ONLY_ACCOUNT_MESSAGE } from "../src/local-only.js";

// specs/self-hosted-build/remote-updates-and-litellm.md §7: login/logout refuse up front,
// before loading bootstrap or touching credentials and the network.
function captureContext() {
  let stderr = "";
  let stdout = "";
  return {
    ctx: {
      stderr: { write: (chunk: string) => ((stderr += chunk), true) },
      stdout: { write: (chunk: string) => ((stdout += chunk), true) },
    },
    output: () => ({ stderr, stdout }),
  };
}

const failingDeps = new Proxy(
  {},
  {
    get(_target, key) {
      throw new Error(`login path touched dependency ${String(key)}`);
    },
  },
);

test("zcode login refuses in the local-only build", async () => {
  const { ctx, output } = captureContext();
  const code = await runLoginCommand(ctx as never, {} as never, failingDeps as never, false, ["zai"]);
  assert.equal(code, 1);
  assert.equal(output().stderr, `${LOCAL_ONLY_ACCOUNT_MESSAGE}\n`);
  assert.equal(output().stdout, "");
});

test("zcode logout refuses in the local-only build", async () => {
  const { ctx, output } = captureContext();
  const code = await runLogoutCommand(ctx as never, {} as never, failingDeps as never);
  assert.equal(code, 1);
  assert.equal(output().stderr, `${LOCAL_ONLY_ACCOUNT_MESSAGE}\n`);
});

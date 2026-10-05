import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ZCODE_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE_ENV,
  ZCODE_BUILTIN_PROVIDER_CONFIG_FILE_ENV,
  ZCODE_PERSONAL_PROVIDER_CONFIG_FILE_ENV,
} from "@zcode/provider-node";
import { prepareCliProviderRuntimeEnv } from "../src/provider-runtime-env.js";

// specs/self-hosted-build/remote-updates-and-litellm.md §2.1: the CLI must hand the bundled
// file to the runtime as the Active path and never materialize or read the Active/LKG cache.
test("self-hosted CLI uses the bundled provider config and creates no cache", async () => {
  const bundled = fileURLToPath(
    new URL("../../../../../config/provider/zcode-builtin.json", import.meta.url),
  );
  const dataBaseDir = await mkdtemp(join(tmpdir(), "zcode-cli-provider-env-"));
  try {
    const env = await prepareCliProviderRuntimeEnv({
      argv: ["tui"],
      env: { [ZCODE_BUILTIN_PROVIDER_CONFIG_FILE_ENV]: bundled },
      dataBaseDir,
    });
    assert.equal(env[ZCODE_BUILTIN_PROVIDER_CONFIG_FILE_ENV], bundled);
    assert.equal(env[ZCODE_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE_ENV], undefined);
    assert.equal(
      env[ZCODE_PERSONAL_PROVIDER_CONFIG_FILE_ENV],
      join(dataBaseDir, ".zcode", "v2", "provider_config.json"),
    );
    assert.deepEqual(await readdir(dataBaseDir), []);
  } finally {
    await rm(dataBaseDir, { recursive: true, force: true });
  }
});

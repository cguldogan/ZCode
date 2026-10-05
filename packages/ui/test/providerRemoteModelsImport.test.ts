import assert from "node:assert/strict";
import test from "node:test";
import {
  addRemoteModelsSequentially,
  filterNewRemoteModelIds,
  remoteModelsErrorMessage,
} from "../src/settings/model-provider-section/providerRemoteModelsImport.js";

test("only offers ids the provider does not already have", () => {
  assert.deepEqual(
    filterNewRemoteModelIds(["claude-sonnet", "gpt-4o", "qwen"], ["gpt-4o", " qwen "]),
    ["claude-sonnet"],
  );
});

test("maps error codes to i18n ids, carrying the HTTP status", () => {
  assert.deepEqual(remoteModelsErrorMessage("http-401"), {
    id: "settings.modelProvider.remoteModels.error.http",
    values: { status: "401" },
  });
  assert.deepEqual(remoteModelsErrorMessage("timeout"), {
    id: "settings.modelProvider.remoteModels.error.timeout",
  });
});

test("adds serially and stops at the first failure", async () => {
  const events: string[] = [];
  let inFlight = 0;
  const outcome = await addRemoteModelsSequentially(
    ["a", "b", "c"],
    async (modelId) => {
      inFlight += 1;
      assert.equal(inFlight, 1, "adds must not overlap");
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      if (modelId === "b") throw new Error("disk full");
      events.push(`added:${modelId}`);
    },
    (done) => events.push(`progress:${done}`),
  );
  assert.deepEqual(outcome, { status: "failed", added: 1, modelId: "b", message: "disk full" });
  assert.deepEqual(events, ["added:a", "progress:1"]);
});

test("reports how many models were added on success", async () => {
  const outcome = await addRemoteModelsSequentially(["a", "b"], async () => {});
  assert.deepEqual(outcome, { status: "done", added: 2 });
});

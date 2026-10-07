import assert from "node:assert/strict";
import test from "node:test";
import { githubBuildUpdateToast } from "../src/root/githubBuildUpdateToast.js";
import enUS from "../src/i18n/locales/en-US.js";
import zhCN from "../src/i18n/locales/zh-CN.js";

// Spec: specs/self-hosted-build/github-update-check.md §5

const latest = "0123456789abcdef0123456789abcdef01234567";
const downloadUrl = "https://github.com/owner/repo/releases/tag/latest";

const models = [
  githubBuildUpdateToast({
    kind: "up-to-date",
    currentCommit: "01234567",
    latestCommit: latest,
    downloadUrl,
  }),
  githubBuildUpdateToast({
    kind: "update-available",
    currentCommit: "fedcba98",
    latestCommit: latest,
    commitsBehind: 1,
    changes: [],
    downloadUrl,
    compareUrl: "https://x",
  }),
  githubBuildUpdateToast({
    kind: "update-available",
    currentCommit: "fedcba98",
    latestCommit: latest,
    commitsBehind: 4,
    changes: [{ sha: latest, subject: "feat: thing" }],
    downloadUrl,
    compareUrl: "https://x",
  }),
  githubBuildUpdateToast({
    kind: "newer-than-latest",
    currentCommit: "fedcba98",
    latestCommit: latest,
    commitsAhead: 2,
    downloadUrl,
  }),
  githubBuildUpdateToast({
    kind: "unknown-build",
    currentCommit: "unknown",
    latestCommit: latest,
    downloadUrl,
  }),
  githubBuildUpdateToast({ kind: "no-release", currentCommit: "fedcba98" }),
  githubBuildUpdateToast({ kind: "error", currentCommit: "fedcba98", message: "offline" }),
];

test("only results with something to download offer the download action", () => {
  assert.deepEqual(
    models.map((model) => model.downloadUrl ?? null),
    [null, downloadUrl, downloadUrl, null, downloadUrl, null, null],
  );
});

test("message ids and values match the result", () => {
  assert.deepEqual(models[0]?.message, {
    id: "update.github.upToDate",
    values: { commit: "01234567" },
  });
  assert.equal(models[1]?.message.id, "update.github.availableOne");
  assert.deepEqual(models[2]?.message, {
    id: "update.github.availableManyWithChange",
    values: { commit: "01234567", count: "4", change: "feat: thing" },
  });
  assert.deepEqual(models[6]?.message, { id: "update.toast.error", values: { error: "offline" } });
});

test("every message id exists in both locales", () => {
  const ids = [...models.map((model) => model.message.id), "update.github.openDownload"];
  ids.push("update.github.availableMany", "update.github.availableOneWithChange");
  for (const locale of [enUS, zhCN] as Array<Record<string, string>>) {
    for (const id of ids) assert.equal(typeof locale[id], "string", id);
  }
});

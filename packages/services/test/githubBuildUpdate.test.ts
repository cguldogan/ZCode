import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  formatGitHubBuildMarker,
  normalizeBuildCommit,
  parseGitHubBuildMarker,
  PRODUCT_GITHUB_REPOSITORY,
} from "@zcode/shared";
import { checkGitHubBuildUpdate } from "@zcode/shared/node";

// Spec: specs/self-hosted-build/github-update-check.md

const LATEST = "0123456789abcdef0123456789abcdef01234567";
const LOCAL = "fedcba98";
const REPO = "owner/repo";
const releaseBody = `Automated build.\n\n${formatGitHubBuildMarker({ commit: LATEST, version: "3.14.3" })}\n`;

interface FakeRoute {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

function fakeFetch(routes: Record<string, FakeRoute>) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: { ...(init?.headers as Record<string, string>) } });
    const route = routes[url.replace("https://api.github.com", "")];
    if (!route) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(route.body ?? {}), {
      status: route.status ?? 200,
      headers: route.headers,
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const releasePath = `/repos/${REPO}/releases/tags/latest`;
const comparePath = `/repos/${REPO}/compare/${LOCAL}...${LATEST}`;
const downloadUrl = `https://github.com/${REPO}/releases/tag/latest`;

test("same commit as the latest release is up to date without a compare request", async () => {
  const { fetchImpl, calls } = fakeFetch({ [releasePath]: { body: { body: releaseBody } } });
  const result = await checkGitHubBuildUpdate({
    repository: REPO,
    currentCommit: LATEST.slice(0, 8),
    fetch: fetchImpl,
  });
  assert.deepEqual(result, {
    kind: "up-to-date",
    currentCommit: LATEST.slice(0, 8),
    latestCommit: LATEST,
    downloadUrl,
  });
  assert.equal(calls.length, 1);
});

test("an older build reports commits behind and the newest subjects first", async () => {
  const commits = Array.from({ length: 7 }, (_, index) => ({
    sha: `${index}`.repeat(40),
    commit: { message: `change ${index}\n\nbody` },
  }));
  const { fetchImpl, calls } = fakeFetch({
    [releasePath]: { body: { body: releaseBody } },
    [comparePath]: {
      body: { status: "ahead", ahead_by: 7, behind_by: 0, html_url: "https://x/compare", commits },
    },
  });
  const result = await checkGitHubBuildUpdate({
    repository: REPO,
    currentCommit: LOCAL,
    fetch: fetchImpl,
  });
  assert.equal(result.kind, "update-available");
  if (result.kind !== "update-available") return;
  assert.equal(result.commitsBehind, 7);
  assert.deepEqual(
    result.changes.map((change) => change.subject),
    ["change 6", "change 5", "change 4", "change 3", "change 2"],
  );
  assert.equal(result.compareUrl, "https://x/compare");
  assert.equal(result.downloadUrl, downloadUrl);

  // Only the public API is contacted, without credentials or identifiers.
  for (const call of calls) {
    assert.ok(call.url.startsWith(`https://api.github.com/repos/${REPO}/`), call.url);
    assert.deepEqual(Object.keys(call.headers).sort(), [
      "Accept",
      "User-Agent",
      "X-GitHub-Api-Version",
    ]);
  }
});

test("diverged counts as an update; behind means this build is newer", async () => {
  for (const [status, kind] of [
    ["diverged", "update-available"],
    ["behind", "newer-than-latest"],
    ["identical", "up-to-date"],
  ] as const) {
    const { fetchImpl } = fakeFetch({
      [releasePath]: { body: { body: releaseBody } },
      [comparePath]: { body: { status, ahead_by: 2, behind_by: 3, commits: [] } },
    });
    const result = await checkGitHubBuildUpdate({
      repository: REPO,
      currentCommit: LOCAL,
      fetch: fetchImpl,
    });
    assert.equal(result.kind, kind, status);
    if (result.kind === "newer-than-latest") assert.equal(result.commitsAhead, 3);
  }
});

test("a commit GitHub does not know, or no commit at all, is an unknown build", async () => {
  const { fetchImpl } = fakeFetch({ [releasePath]: { body: { body: releaseBody } } });
  const unpushed = await checkGitHubBuildUpdate({
    repository: REPO,
    currentCommit: LOCAL,
    fetch: fetchImpl,
  });
  assert.equal(unpushed.kind, "unknown-build");

  const { fetchImpl: fetchOnce, calls } = fakeFetch({
    [releasePath]: { body: { body: releaseBody } },
  });
  const dev = await checkGitHubBuildUpdate({
    repository: REPO,
    currentCommit: "unknown",
    fetch: fetchOnce,
  });
  assert.deepEqual(dev, {
    kind: "unknown-build",
    currentCommit: "unknown",
    latestCommit: LATEST,
    downloadUrl,
  });
  assert.equal(calls.length, 1);
});

test("missing release, missing marker, rate limit and timeout are reported, not thrown", async () => {
  const none = await checkGitHubBuildUpdate({
    repository: REPO,
    currentCommit: LOCAL,
    fetch: fakeFetch({}).fetchImpl,
  });
  assert.deepEqual(none, { kind: "no-release", currentCommit: LOCAL });

  const noMarker = await checkGitHubBuildUpdate({
    repository: REPO,
    currentCommit: LOCAL,
    fetch: fakeFetch({ [releasePath]: { body: { body: "no marker" } } }).fetchImpl,
  });
  assert.equal(noMarker.kind, "error");

  const limited = await checkGitHubBuildUpdate({
    repository: REPO,
    currentCommit: LOCAL,
    fetch: fakeFetch({
      [releasePath]: { status: 403, headers: { "x-ratelimit-remaining": "0" } },
    }).fetchImpl,
  });
  assert.deepEqual(limited, {
    kind: "error",
    currentCommit: LOCAL,
    message: "GitHub rate limit reached; try again later.",
  });

  const hanging = ((_input: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    })) as typeof fetch;
  const timedOut = await checkGitHubBuildUpdate({
    repository: REPO,
    currentCommit: LOCAL,
    fetch: hanging,
    timeoutMs: 20,
  });
  assert.deepEqual(timedOut, {
    kind: "error",
    currentCommit: LOCAL,
    message: "GitHub did not respond in time.",
  });
});

test("the marker written by publish-release.sh parses", () => {
  const script = readFileSync(
    fileURLToPath(new URL("../../../.github/scripts/publish-release.sh", import.meta.url)),
    "utf8",
  );
  const formats = [...script.matchAll(/printf '(<!-- zcode-beyond-build [^']*)'/g)].map(
    (match) => match[1] ?? "",
  );
  assert.equal(formats.length, 2);
  for (const format of formats) {
    const rendered = execFileSync(
      "bash",
      ["-c", `printf '${format}' "$0" "$1"`, LATEST, "3.14.3"],
      {
        encoding: "utf8",
      },
    );
    assert.equal(parseGitHubBuildMarker(`notes\n${rendered}`)?.commit, LATEST, rendered);
  }
  assert.equal(parseGitHubBuildMarker(releaseBody)?.version, "3.14.3");
  assert.equal(parseGitHubBuildMarker('<!-- zcode-beyond-build {"commit":"abc"} -->'), undefined);
});

test("local commit ids are normalized; placeholders are not commits", () => {
  assert.equal(normalizeBuildCommit(" ABCDEF12 "), "abcdef12");
  assert.equal(normalizeBuildCommit("unknown"), undefined);
  assert.equal(normalizeBuildCommit("abc"), undefined);
  assert.equal(normalizeBuildCommit(undefined), undefined);
  assert.equal(PRODUCT_GITHUB_REPOSITORY, "cguldogan/ZCode");
});

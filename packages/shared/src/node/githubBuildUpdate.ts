import {
  GITHUB_BUILD_UPDATE_MAX_CHANGES,
  GITHUB_ROLLING_RELEASE_TAG,
  gitHubRollingReleaseUrl,
  normalizeBuildCommit,
  parseGitHubBuildMarker,
  type GitHubBuildChange,
  type GitHubBuildUpdateResult,
} from "../githubBuildUpdate.js";

// Single owner of the GitHub update check (desktop menu and `zcode update`). Stateless:
// callers own the trigger and the presentation. It only reads public GitHub data and
// sends no identifier. Spec: specs/self-hosted-build/github-update-check.md §4.

export const GITHUB_BUILD_UPDATE_TIMEOUT_MS = 10_000;

const GITHUB_API_ORIGIN = "https://api.github.com";

export interface CheckGitHubBuildUpdateOptions {
  /** owner/name, e.g. PRODUCT_GITHUB_REPOSITORY. */
  readonly repository: string;
  /** The running build's commit (ZCODE_COMMIT); "unknown" when not built from git. */
  readonly currentCommit: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

interface ReleaseResponse {
  readonly body?: string | null;
}

interface CompareResponse {
  readonly status?: string;
  readonly ahead_by?: number;
  readonly behind_by?: number;
  readonly html_url?: string;
  readonly commits?: ReadonlyArray<{ sha?: string; commit?: { message?: string } }>;
}

class GitHubRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function checkGitHubBuildUpdate(
  options: CheckGitHubBuildUpdateOptions,
): Promise<GitHubBuildUpdateResult> {
  const currentCommit = options.currentCommit;
  const downloadUrl = gitHubRollingReleaseUrl(options.repository);
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs ?? GITHUB_BUILD_UPDATE_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
  const get = <T>(path: string) =>
    getGitHubJson<T>(options.fetch ?? globalThis.fetch, `${GITHUB_API_ORIGIN}${path}`, signal);
  const repoPath = `/repos/${options.repository}`;

  try {
    let release: ReleaseResponse;
    try {
      release = await get<ReleaseResponse>(
        `${repoPath}/releases/tags/${GITHUB_ROLLING_RELEASE_TAG}`,
      );
    } catch (error) {
      if (error instanceof GitHubRequestError && error.status === 404) {
        return { kind: "no-release", currentCommit };
      }
      throw error;
    }

    const marker = parseGitHubBuildMarker(release.body);
    if (!marker) {
      return {
        kind: "error",
        currentCommit,
        message: "The latest GitHub release has no build marker; publish a new build first.",
      };
    }
    const latestCommit = marker.commit;
    const local = normalizeBuildCommit(currentCommit);
    if (!local) return { kind: "unknown-build", currentCommit, latestCommit, downloadUrl };
    if (latestCommit.startsWith(local)) {
      return { kind: "up-to-date", currentCommit, latestCommit, downloadUrl };
    }

    let compare: CompareResponse;
    try {
      compare = await get<CompareResponse>(`${repoPath}/compare/${local}...${latestCommit}`);
    } catch (error) {
      // 404: the local commit was never pushed (a local build with unpublished changes).
      if (error instanceof GitHubRequestError && error.status === 404) {
        return { kind: "unknown-build", currentCommit, latestCommit, downloadUrl };
      }
      throw error;
    }

    switch (compare.status) {
      case "identical":
        return { kind: "up-to-date", currentCommit, latestCommit, downloadUrl };
      case "behind":
        return {
          kind: "newer-than-latest",
          currentCommit,
          latestCommit,
          commitsAhead: compare.behind_by ?? 0,
          downloadUrl,
        };
      case "ahead":
      case "diverged":
        return {
          kind: "update-available",
          currentCommit,
          latestCommit,
          commitsBehind: compare.ahead_by ?? 0,
          changes: newestChanges(compare.commits ?? []),
          downloadUrl,
          compareUrl:
            compare.html_url ??
            `https://github.com/${options.repository}/compare/${local}...${latestCommit}`,
        };
      default:
        return {
          kind: "error",
          currentCommit,
          message: `Unexpected GitHub compare status: ${String(compare.status)}`,
        };
    }
  } catch (error) {
    return { kind: "error", currentCommit, message: describeError(error, timeoutSignal) };
  }
}

/** GitHub lists compare commits oldest first; the result shows the newest first. */
function newestChanges(
  commits: NonNullable<CompareResponse["commits"]>,
): readonly GitHubBuildChange[] {
  return commits
    .slice(-GITHUB_BUILD_UPDATE_MAX_CHANGES)
    .reverse()
    .flatMap((entry) => {
      const subject = entry.commit?.message?.split("\n", 1)[0]?.trim();
      return entry.sha && subject ? [{ sha: entry.sha, subject }] : [];
    });
}

async function getGitHubJson<T>(
  fetchImpl: typeof globalThis.fetch,
  url: string,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ZCode-Beyond-UpdateCheck",
    },
    redirect: "follow",
    signal,
  });
  if (!response.ok) {
    const rateLimited =
      response.status === 429 ||
      (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0");
    throw new GitHubRequestError(
      response.status,
      rateLimited
        ? "GitHub rate limit reached; try again later."
        : `GitHub responded with HTTP ${response.status}.`,
    );
  }
  return (await response.json()) as T;
}

function describeError(error: unknown, timeoutSignal: AbortSignal): string {
  if (timeoutSignal.aborted) return "GitHub did not respond in time.";
  if (error instanceof GitHubRequestError) return error.message;
  if (error instanceof Error && error.name === "AbortError") return "Update check cancelled.";
  return `Could not reach GitHub: ${error instanceof Error ? error.message : String(error)}`;
}

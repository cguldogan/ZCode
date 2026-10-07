// Types and pure helpers for "Check for updates" against this fork's GitHub releases.
// The network part lives in ./node/githubBuildUpdate.ts.
// Spec: specs/self-hosted-build/github-update-check.md.

/** Release tag of the rolling build that every push to main republishes. */
export const GITHUB_ROLLING_RELEASE_TAG = "latest";

/** How many of the newest commit subjects an "update available" result carries. */
export const GITHUB_BUILD_UPDATE_MAX_CHANGES = 5;

export interface GitHubBuildChange {
  readonly sha: string;
  readonly subject: string;
}

export type GitHubBuildUpdateResult =
  | { kind: "up-to-date"; currentCommit: string; latestCommit: string; downloadUrl: string }
  | {
      kind: "update-available";
      currentCommit: string;
      latestCommit: string;
      commitsBehind: number;
      changes: readonly GitHubBuildChange[];
      downloadUrl: string;
      compareUrl: string;
    }
  | {
      kind: "newer-than-latest";
      currentCommit: string;
      latestCommit: string;
      commitsAhead: number;
      downloadUrl: string;
    }
  | {
      /** The local commit is unknown or not on GitHub (built from local changes). */
      kind: "unknown-build";
      currentCommit: string;
      latestCommit: string;
      downloadUrl: string;
    }
  | { kind: "no-release"; currentCommit: string }
  | { kind: "error"; currentCommit: string; message: string };

export interface GitHubBuildMarker {
  readonly commit: string;
  readonly version?: string;
}

const MARKER_PATTERN = /<!--\s*zcode-beyond-build\s+(\{[^\n]*?\})\s*-->/;
const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/;
const SHORT_SHA_PATTERN = /^[0-9a-f]{7,40}$/;

/** Formats the marker that publish-release.sh appends to the rolling release notes. */
export function formatGitHubBuildMarker(marker: GitHubBuildMarker): string {
  return `<!-- zcode-beyond-build ${JSON.stringify(marker)} -->`;
}

/** Reads the build marker from release notes; undefined when absent or malformed. */
export function parseGitHubBuildMarker(
  body: string | null | undefined,
): GitHubBuildMarker | undefined {
  const match = body ? MARKER_PATTERN.exec(body) : null;
  if (!match?.[1]) return undefined;
  try {
    const value = JSON.parse(match[1]) as { commit?: unknown; version?: unknown };
    const commit = typeof value.commit === "string" ? value.commit.toLowerCase() : "";
    if (!FULL_SHA_PATTERN.test(commit)) return undefined;
    return typeof value.version === "string" && value.version
      ? { commit, version: value.version }
      : { commit };
  } catch {
    return undefined;
  }
}

/** A usable local commit id: hex, at least 7 characters. "unknown" and dev values are not. */
export function normalizeBuildCommit(commit: string | null | undefined): string | undefined {
  const value = commit?.trim().toLowerCase() ?? "";
  return SHORT_SHA_PATTERN.test(value) ? value : undefined;
}

export function shortCommit(commit: string): string {
  return commit.slice(0, 8);
}

export function gitHubRollingReleaseUrl(repository: string): string {
  return `https://github.com/${repository}/releases/tag/${GITHUB_ROLLING_RELEASE_TAG}`;
}

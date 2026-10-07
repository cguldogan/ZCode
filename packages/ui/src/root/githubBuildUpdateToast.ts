import { shortCommit, type GitHubBuildUpdateResult } from "@zcode/shared";

// Maps the GitHub build check result to one toast: message plus an optional
// "Open download page" action. Spec: specs/self-hosted-build/github-update-check.md §5.

export interface GitHubBuildUpdateToastModel {
  readonly message: { readonly id: string; readonly values?: Record<string, string> };
  /** Release page to open from the toast action; absent when there is nothing to download. */
  readonly downloadUrl?: string;
}

export function githubBuildUpdateToast(
  result: GitHubBuildUpdateResult,
): GitHubBuildUpdateToastModel {
  switch (result.kind) {
    case "up-to-date":
      return {
        message: {
          id: "update.github.upToDate",
          values: { commit: shortCommit(result.latestCommit) },
        },
      };
    case "update-available": {
      const latestChange = result.changes[0]?.subject;
      const values = {
        commit: shortCommit(result.latestCommit),
        count: String(result.commitsBehind),
        ...(latestChange ? { change: latestChange } : {}),
      };
      const id =
        result.commitsBehind === 1 ? "update.github.availableOne" : "update.github.availableMany";
      return {
        message: { id: latestChange ? `${id}WithChange` : id, values },
        downloadUrl: result.downloadUrl,
      };
    }
    case "newer-than-latest":
      return {
        message: {
          id: "update.github.newerThanLatest",
          values: {
            current: shortCommit(result.currentCommit),
            latest: shortCommit(result.latestCommit),
          },
        },
      };
    case "unknown-build":
      return {
        message: {
          id: "update.github.unknownBuild",
          values: {
            current: result.currentCommit,
            latest: shortCommit(result.latestCommit),
          },
        },
        downloadUrl: result.downloadUrl,
      };
    case "no-release":
      return { message: { id: "update.github.noRelease" } };
    case "error":
      return { message: { id: "update.toast.error", values: { error: result.message } } };
  }
}

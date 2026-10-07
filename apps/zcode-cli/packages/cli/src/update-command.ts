import { formatJson } from "@zcode/core";
import type { GlobalOptions, RunContext } from "@zcode/shared-types";
import {
  PRODUCT_GITHUB_REPOSITORY,
  shortCommit,
  ZCODE_COMMIT,
  type GitHubBuildUpdateResult,
} from "@zcode/shared";
import { checkGitHubBuildUpdate } from "@zcode/shared/node";

// `zcode update`: asks this fork's GitHub releases whether a newer build exists. Report only:
// it never downloads, installs or writes files. Spec: specs/self-hosted-build/github-update-check.md.

export const UPDATE_COMMAND_USAGE = "Usage: zcode update [--json]";
/** Distinct exit code so scripts can tell "update available" from success and failure. */
export const UPDATE_AVAILABLE_EXIT_CODE = 10;

export interface UpdateCommandDependencies {
  readonly checkUpdate?: typeof checkGitHubBuildUpdate;
  readonly currentCommit?: string;
}

export async function runUpdateCommand(
  ctx: RunContext,
  options: GlobalOptions,
  args: readonly string[],
  deps: UpdateCommandDependencies = {},
): Promise<number> {
  if (args.length > 0) {
    ctx.stderr.write(`${UPDATE_COMMAND_USAGE}\n`);
    return 1;
  }
  const result = await (deps.checkUpdate ?? checkGitHubBuildUpdate)({
    repository: PRODUCT_GITHUB_REPOSITORY,
    currentCommit: deps.currentCommit ?? ZCODE_COMMIT,
  });

  if (options.json) {
    // `changes` is a readonly list; copy it so the result matches the JSON value type.
    ctx.stdout.write(
      formatJson(
        result.kind === "update-available"
          ? { ...result, changes: result.changes.map((change) => ({ ...change })) }
          : result,
      ),
    );
  } else if (result.kind === "error") {
    ctx.stderr.write(`Update check failed: ${result.message}\n`);
  } else {
    ctx.stdout.write(`${formatUpdateResult(result).join("\n")}\n`);
  }
  return updateExitCode(result);
}

export function updateExitCode(result: GitHubBuildUpdateResult): number {
  if (result.kind === "error") return 1;
  return result.kind === "update-available" ? UPDATE_AVAILABLE_EXIT_CODE : 0;
}

export function formatUpdateResult(
  result: Exclude<GitHubBuildUpdateResult, { kind: "error" }>,
): string[] {
  switch (result.kind) {
    case "up-to-date":
      return [`You're on the latest build (${shortCommit(result.latestCommit)}).`];
    case "update-available": {
      const commits =
        result.commitsBehind === 1 ? "1 new commit" : `${result.commitsBehind} new commits`;
      return [
        `A newer build is available: ${shortCommit(result.currentCommit)} -> ${shortCommit(result.latestCommit)} (${commits}).`,
        ...result.changes.map((change) => `  ${shortCommit(change.sha)} ${change.subject}`),
        `Changes:  ${result.compareUrl}`,
        `Download: ${result.downloadUrl}`,
      ];
    }
    case "newer-than-latest":
      return [
        `This build (${shortCommit(result.currentCommit)}) is newer than the latest published build (${shortCommit(result.latestCommit)}).`,
      ];
    case "unknown-build":
      return [
        `This build (${result.currentCommit}) is not a published build; the latest published build is ${shortCommit(result.latestCommit)}.`,
        `Download: ${result.downloadUrl}`,
      ];
    case "no-release":
      return ["No build has been published on GitHub yet."];
  }
}

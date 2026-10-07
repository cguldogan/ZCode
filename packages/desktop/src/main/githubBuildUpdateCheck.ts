import type { BrowserWindow } from "electron";
import {
  PlatformChannels,
  PRODUCT_GITHUB_REPOSITORY,
  shortCommit,
  ZCODE_COMMIT,
  type UpdateCheckResultPayload,
} from "@zcode/shared";
import { checkGitHubBuildUpdate } from "@zcode/shared/node";

// Self-hosted build: "Check for Updates…" asks this fork's GitHub releases whether a newer
// rolling build exists, and reports it to the window that asked. Manual only; nothing is
// downloaded. Spec: specs/self-hosted-build/github-update-check.md §5.

export async function runGitHubBuildUpdateCheck(options: {
  targetWindow: BrowserWindow | null;
  logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void };
}): Promise<void> {
  options.logger.info("[update-check] manual GitHub build check");
  const result = await checkGitHubBuildUpdate({
    repository: PRODUCT_GITHUB_REPOSITORY,
    currentCommit: ZCODE_COMMIT,
  });
  if (result.kind === "error") {
    options.logger.warn(`[update-check] failed: ${result.message}`);
  } else {
    const latest = "latestCommit" in result ? shortCommit(result.latestCommit) : "-";
    options.logger.info(
      `[update-check] result=${result.kind} current=${result.currentCommit} latest=${latest}`,
    );
  }

  const targetWindow = options.targetWindow;
  if (!targetWindow || targetWindow.isDestroyed()) {
    options.logger.warn("[update-check] no window to report the result to");
    return;
  }
  targetWindow.webContents.send(PlatformChannels.UpdateCheckResult, {
    kind: "github-build",
    result,
  } satisfies UpdateCheckResultPayload);
}

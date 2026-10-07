// File-state primitives shared by the file-summary rewind (file-rewind.ts) and the
// /undo / /redo commands (turn-undo.ts, specs/tui/diff-review-undo.md §2). Both read the same
// workspace checkpoint artifacts; keeping hashing, path resolution and journal compensation in
// one place guarantees undo and redo apply the exact same safety rules.
import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { applyPatch, type StructuredPatch } from "diff";
import { isFileSystemPortError } from "../deps.js";
import type { TraceContext, WorkspaceCheckpointArtifact } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";

export type PlannedFileState = {
  content: string | null;
  exists: boolean;
  hash: string | null;
};

export type FileRewindJournalEntry = {
  path: string;
  state: PlannedFileState;
};

export async function compensateFileRewindJournal(
  this: AgentRuntimeInternal,
  journal: FileRewindJournalEntry[],
  traceContext: TraceContext,
): Promise<void> {
  for (const entry of [...journal].reverse()) {
    if (!entry.state.exists || entry.state.content === null) {
      await this.fileSystemPort!.removeFile({
        path: entry.path,
        missingOk: true,
        trace: traceContext,
      });
      continue;
    }
    await this.fileSystemPort!.writeTextFile({
      path: entry.path,
      content: entry.state.content,
      createParents: true,
      atomic: true,
      trace: traceContext,
    });
  }
}

export function resolveCheckpointFilePath(workspaceRoot: string, path: string): string {
  return isAbsolute(path) ? path : resolve(workspaceRoot, path);
}

export function resolveCheckpointAfterContent(
  file: WorkspaceCheckpointArtifact["files"][number],
): string | null | undefined {
  const afterContent = (file as { afterContent?: unknown }).afterContent;
  if (typeof afterContent === "string") {
    return afterContent;
  }

  if (!file.existedBefore && file.beforeContent === null && file.structuredPatch.length === 0) {
    return undefined;
  }

  const beforeContent = file.beforeContent ?? "";
  const patch: StructuredPatch = {
    oldFileName: file.path,
    newFileName: file.path,
    oldHeader: undefined,
    newHeader: undefined,
    hunks: file.structuredPatch,
  };
  const patched = applyPatch(beforeContent, patch, {
    autoConvertLineEndings: false,
    fuzzFactor: 0,
  });
  return typeof patched === "string" ? patched : undefined;
}

export async function readCurrentFileState(
  this: AgentRuntimeInternal,
  path: string,
  traceContext: TraceContext,
  abortSignal: AbortSignal | undefined,
): Promise<PlannedFileState | { message?: string; reason: "file_read_failed" }> {
  try {
    const read = await this.fileSystemPort!.readTextFile(
      {
        path,
        trace: traceContext,
      },
      { signal: abortSignal },
    );
    return {
      content: read.content,
      exists: true,
      hash: hashContent(read.content),
    };
  } catch (error) {
    if (isFileSystemPortError(error) && error.code === "not_found") {
      return {
        content: null,
        exists: false,
        hash: hashContent(null),
      };
    }
    return {
      reason: "file_read_failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export function hashContent(content: string | null): string {
  if (content === null) {
    return "missing";
  }
  return createHash("sha256").update(content).digest("hex");
}

export function isIgnoredShellTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    normalized === "bash" ||
    normalized === "shell" ||
    normalized.includes("terminal") ||
    normalized.endsWith("shell")
  );
}

/**
 * Message for files refused because they resolve outside the workspace. The reason code stays
 * `unsupported_checkpoint` because the unsafe-reason set is part of the desktop protocol schema.
 */
export const OUTSIDE_WORKSPACE_MESSAGE = "outside the workspace";

/**
 * True when `path` resolves inside `workspaceRoot`. Undo/redo never write outside the
 * workspace even if an earlier tool call was allowed to (absolute paths, `..` segments).
 */
export function isPathInsideWorkspace(workspaceRoot: string, path: string): boolean {
  const relativePath = relative(resolve(workspaceRoot), resolve(path));
  if (relativePath.length === 0) return false;
  const escapes = relativePath === ".." || relativePath.startsWith(`..${sep}`);
  return !escapes && !isAbsolute(relativePath);
}

import type { ProviderRemoteModelsErrorCode } from "@zcode/services";

// Pure rules for the "Load models" dialog.
// Spec: specs/self-hosted-build/remote-updates-and-litellm.md §2.3.

/** Ids reported by the server that the provider does not have yet, in server order. */
export function filterNewRemoteModelIds(
  remoteModelIds: readonly string[],
  existingModelIds: readonly string[],
): string[] {
  const existing = new Set(existingModelIds.map((modelId) => modelId.trim()));
  return remoteModelIds.filter((modelId) => !existing.has(modelId.trim()));
}

export function remoteModelsErrorMessage(code: ProviderRemoteModelsErrorCode): {
  readonly id: string;
  readonly values?: Record<string, string>;
} {
  const status = /^http-(\d+)$/.exec(code)?.[1];
  if (status) {
    return { id: "settings.modelProvider.remoteModels.error.http", values: { status } };
  }
  return { id: `settings.modelProvider.remoteModels.error.${code}` };
}

export type RemoteModelsAddOutcome =
  | { readonly status: "done"; readonly added: number }
  | {
      readonly status: "failed";
      readonly added: number;
      readonly modelId: string;
      readonly message: string;
    };

/**
 * Adds one model at a time through the existing personal-model path. Each add rewrites the
 * personal config, so they must not overlap; the first failure stops the run so the user
 * sees exactly which ids landed.
 */
export async function addRemoteModelsSequentially(
  modelIds: readonly string[],
  addModel: (modelId: string) => Promise<void>,
  onProgress?: (done: number) => void,
): Promise<RemoteModelsAddOutcome> {
  let added = 0;
  for (const modelId of modelIds) {
    try {
      await addModel(modelId);
    } catch (error) {
      return {
        status: "failed",
        added,
        modelId,
        message: error instanceof Error ? error.message : String(error),
      };
    }
    added += 1;
    onProgress?.(added);
  }
  return { status: "done", added };
}

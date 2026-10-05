import { useCallback, useRef, useState } from "react";
import { CloudDownloadIcon } from "lucide-react";
import type { ProviderRemoteModelsResult } from "@zcode/services";
import {
  TID_MODEL_PROVIDER_LOAD_REMOTE_MODELS_BUTTON,
  TID_MODEL_PROVIDER_REMOTE_MODELS_ADD_BUTTON,
  TID_MODEL_PROVIDER_REMOTE_MODELS_DIALOG,
} from "@zcode/shared";
import { Button } from "@/components/ui/button.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { Spinner } from "@/components/ui/spinner.js";
import { useServices } from "@/hooks/useServices.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { logger } from "@/logger.js";
import {
  addRemoteModelsSequentially,
  filterNewRemoteModelIds,
  remoteModelsErrorMessage,
} from "./providerRemoteModelsImport.js";

type LoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "loaded"; readonly modelIds: readonly string[] }
  | { readonly kind: "error"; readonly message: string };

/**
 * "Load models" for OpenAI-compatible providers (LiteLLM etc.). The discovered list is
 * transient and owned by this dialog; membership is written only through `onAddModel`.
 */
export function ProviderRemoteModelsButton({
  providerId,
  baseUrl,
  existingModelIds,
  onAddModel,
}: {
  providerId: string;
  baseUrl: string;
  existingModelIds: readonly string[];
  onAddModel: (modelId: string) => Promise<void>;
}) {
  const { intl } = useZCodeIntl();
  const { providerSettingsService } = useServices();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [progress, setProgress] = useState<number | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  // Closing or reloading bumps the generation so a late response cannot repaint the dialog.
  const generationRef = useRef(0);
  const existingRef = useRef(existingModelIds);
  existingRef.current = existingModelIds;

  const load = useCallback(async () => {
    const generation = ++generationRef.current;
    setState({ kind: "loading" });
    setAddError(null);
    let result: ProviderRemoteModelsResult;
    try {
      result = await providerSettingsService.listRemoteModels({ providerId });
    } catch (error) {
      logger.warn("[ProviderRemoteModels] listRemoteModels failed", { providerId, error });
      result = { ok: false, code: "network", message: String(error) };
    }
    if (generation !== generationRef.current) return;
    if (!result.ok) {
      const message = remoteModelsErrorMessage(result.code);
      setState({ kind: "error", message: intl.formatMessage({ id: message.id }, message.values) });
      return;
    }
    const modelIds = filterNewRemoteModelIds(result.modelIds, existingRef.current);
    setSelected(new Set(modelIds));
    setState({ kind: "loaded", modelIds });
  }, [intl, providerId, providerSettingsService]);

  const adding = progress !== null;

  const handleOpenChange = (next: boolean) => {
    if (adding) return;
    setOpen(next);
    if (next) void load();
    else generationRef.current += 1;
  };

  const handleAdd = async () => {
    if (state.kind !== "loaded" || adding) return;
    const modelIds = state.modelIds.filter((modelId) => selected.has(modelId));
    setAddError(null);
    setProgress(0);
    const outcome = await addRemoteModelsSequentially(modelIds, onAddModel, setProgress);
    setProgress(null);
    if (outcome.status === "done") {
      setOpen(false);
      return;
    }
    setAddError(
      intl.formatMessage(
        { id: "settings.modelProvider.remoteModels.addFailed" },
        {
          done: outcome.added,
          total: modelIds.length,
          modelId: outcome.modelId,
          message: outcome.message,
        },
      ),
    );
    // Drop the ids that did land so a retry only adds the rest.
    const remaining = state.modelIds.filter(
      (modelId) => !modelIds.slice(0, outcome.added).includes(modelId),
    );
    setState({ kind: "loaded", modelIds: remaining });
    setSelected((current) => new Set(remaining.filter((modelId) => current.has(modelId))));
  };

  const toggle = (modelId: string, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(modelId);
      else next.delete(modelId);
      return next;
    });

  const loadedIds = state.kind === "loaded" ? state.modelIds : [];
  const allSelected = loadedIds.length > 0 && loadedIds.every((modelId) => selected.has(modelId));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        type="button"
        variant="secondary"
        size="default"
        className="rounded-lg"
        data-testid={TID_MODEL_PROVIDER_LOAD_REMOTE_MODELS_BUTTON}
        onClick={() => handleOpenChange(true)}
      >
        <CloudDownloadIcon data-icon="inline-start" aria-hidden="true" />
        {intl.formatMessage({ id: "settings.modelProvider.remoteModels.load" })}
      </Button>
      <DialogContent
        className="max-h-[min(40rem,calc(100vh-4rem))] max-w-lg grid-rows-[auto_minmax(0,1fr)_auto] overflow-clip"
        data-testid={TID_MODEL_PROVIDER_REMOTE_MODELS_DIALOG}
        data-no-model-drag="true"
      >
        <DialogHeader className="pr-8">
          <DialogTitle>
            {intl.formatMessage({ id: "settings.modelProvider.remoteModels.title" })}
          </DialogTitle>
          <DialogDescription className="break-words text-ui-sm text-foreground-subtle">
            {intl.formatMessage(
              { id: "settings.modelProvider.remoteModels.description" },
              { baseUrl: baseUrl.replace(/\/+$/, "") },
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto" inert={adding}>
          {state.kind === "loading" ? (
            <div className="flex items-center gap-2 py-6 text-ui-base text-foreground-subtle">
              <Spinner className="size-4" />
              {intl.formatMessage({ id: "settings.modelProvider.remoteModels.loading" })}
            </div>
          ) : state.kind === "error" ? (
            <p role="alert" className="py-4 text-ui-base text-destructive">
              {state.message}
            </p>
          ) : loadedIds.length === 0 ? (
            <p className="py-4 text-ui-base text-foreground-subtle">
              {intl.formatMessage({ id: "settings.modelProvider.remoteModels.empty" })}
            </p>
          ) : (
            <div className="rounded-xl border border-input-border bg-input p-1">
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-ui-base text-foreground-subtle">
                <Checkbox
                  checked={allSelected ? true : selected.size > 0 ? "indeterminate" : false}
                  onCheckedChange={(checked) =>
                    setSelected(checked === true ? new Set(loadedIds) : new Set())
                  }
                />
                {intl.formatMessage(
                  { id: "settings.modelProvider.remoteModels.selectAll" },
                  { count: loadedIds.length },
                )}
              </label>
              <div className="flex flex-col gap-0.5">
                {loadedIds.map((modelId) => (
                  <label
                    key={modelId}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-hover"
                  >
                    <Checkbox
                      checked={selected.has(modelId)}
                      onCheckedChange={(checked) => toggle(modelId, checked === true)}
                    />
                    <span className="min-w-0 truncate font-mono text-ui-base text-foreground">
                      {modelId}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {addError ? (
            <p role="alert" className="pt-3 text-ui-sm text-destructive">
              {addError}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          {state.kind === "error" ? (
            <Button type="button" variant="secondary" onClick={() => void load()}>
              {intl.formatMessage({ id: "settings.modelProvider.remoteModels.retry" })}
            </Button>
          ) : null}
          <Button
            type="button"
            data-testid={TID_MODEL_PROVIDER_REMOTE_MODELS_ADD_BUTTON}
            disabled={state.kind !== "loaded" || selected.size === 0 || adding}
            onClick={() => void handleAdd()}
          >
            {adding ? <Spinner data-icon="inline-start" className="size-4" /> : null}
            {adding
              ? intl.formatMessage(
                  { id: "settings.modelProvider.remoteModels.adding" },
                  { done: progress, total: selected.size },
                )
              : intl.formatMessage(
                  { id: "settings.modelProvider.remoteModels.add" },
                  { count: selected.size },
                )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

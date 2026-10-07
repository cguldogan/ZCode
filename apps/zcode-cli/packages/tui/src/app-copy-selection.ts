import type { TuiCopy } from "@zcode/i18n";
import { useCallback, type Dispatch, type SetStateAction } from "react";
import { selectionCopyStatus, type SelectionCopyResult } from "./app-copy.js";

export type { SelectionCopyResult };

/** Ctrl+C/Ctrl+Y copy of the renderer selection; moved out of app.tsx (file size limit). */
export function useCopyCurrentSelection(input: {
  copy: TuiCopy["copy"];
  copySelection: () => Promise<SelectionCopyResult>;
  hasCopyableSelection: () => boolean;
  setStatus: Dispatch<SetStateAction<string>>;
  setStatusDetails: Dispatch<SetStateAction<string[]>>;
}): () => boolean {
  const { copy, copySelection, hasCopyableSelection, setStatus, setStatusDetails } = input;
  return useCallback((): boolean => {
    if (!hasCopyableSelection()) return false;
    void copySelection().then((result) => {
      const copyStatus = selectionCopyStatus(result, copy);
      if (copyStatus.status) setStatus(copyStatus.status);
      if (copyStatus.details) setStatusDetails(copyStatus.details);
    });
    return true;
  }, [copy, copySelection, hasCopyableSelection, setStatus, setStatusDetails]);
}

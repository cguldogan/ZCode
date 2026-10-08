import React from "react";
import type { ModelSelection } from "@zcode/shared";
import type { SessionEvent, TurnId } from "@zcode/contracts";
import { submitDuringActiveTurn, submitIdleTurn } from "./app-submit.js";
import type {
  DraftAttachment,
  Message,
  QueuedInput,
  SelectionState,
  SubmitValueOptions,
  SlashSelectionState,
} from "./app-model.js";
import type { TuiOptions, TuiRequestPermission, TuiSubmitPromptResult } from "./types.js";

export function useSubmitValue(input: {
  activeTurnId?: TurnId;
  applyResult: (result: TuiSubmitPromptResult, preserveTurnState?: boolean) => void;
  applySessionEvent: (event: SessionEvent) => void;
  busy: boolean;
  draftAttachmentsRef: React.MutableRefObject<DraftAttachment[]>;
  emptyPromptStatus: string;
  messageInsertIndex: number;
  onExit?: (code: number) => void;
  /** Opens the local /mcp manager (specs/tui/mcp-manager.md). */
  openMcp?: () => void;
  /** Opens the local /review view (specs/tui/diff-review-undo.md §1). */
  openReview?: () => void;
  options: TuiOptions;
  requestPermission: TuiRequestPermission;
  resolveSubmittedText: (submittedValue: string) => string;
  resolveSubmittedModel?: (submittedValue: string) => ModelSelection | undefined;
  setBusy: (value: boolean) => void;
  setDraftAttachments: React.Dispatch<React.SetStateAction<DraftAttachment[]>>;
  setDraftValue: (value: string) => void;
  setLastError: (message: string | undefined) => void;
  setLiveModelText: (value: string) => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setQueuedInputs: React.Dispatch<React.SetStateAction<QueuedInput[]>>;
  setSelection: React.Dispatch<React.SetStateAction<SelectionState | undefined>>;
  setSlashSelection: React.Dispatch<React.SetStateAction<SlashSelectionState | undefined>>;
  setStatus: (status: string) => void;
  setStatusDetails: React.Dispatch<React.SetStateAction<string[]>>;
  turnRef: React.MutableRefObject<AbortController | undefined>;
}): (submittedValue: string, options?: SubmitValueOptions) => Promise<void> {
  return React.useCallback(
    async (submittedValue: string, options: SubmitValueOptions = {}) => {
      const text = input.resolveSubmittedText(submittedValue).trim();
      const modelSelection = input.resolveSubmittedModel?.(submittedValue);
      if (!text) {
        input.setStatus(input.emptyPromptStatus);
        return;
      }

      // Checked before the busy branch so /exit mid-turn exits instead of queueing as steer input.
      if (input.onExit && isExitCommand(text)) {
        input.turnRef.current?.abort();
        input.onExit(0);
        return;
      }

      // /review is read-only and local, so it opens even while a turn is running.
      if (input.openReview && isReviewCommand(text)) {
        input.setDraftValue("");
        input.setSlashSelection(undefined);
        input.openReview();
        return;
      }

      // Bare /mcp opens the manager; `/mcp list|enable|...` keep their text behavior in the CLI.
      if (input.openMcp && isMcpCommand(text)) {
        input.setDraftValue("");
        input.setSlashSelection(undefined);
        input.openMcp();
        return;
      }

      if (input.busy) {
        await submitDuringActiveTurn({
          activeTurnId: input.activeTurnId,
          applyResult: input.applyResult,
          applySessionEvent: input.applySessionEvent,
          draftAttachments: input.draftAttachmentsRef.current,
          messageInsertIndex: input.messageInsertIndex,
          options: input.options,
          requestPermission: input.requestPermission,
          setDraftValue: input.setDraftValue,
          setLastError: input.setLastError,
          setMessages: input.setMessages,
          setQueuedInputs: input.setQueuedInputs,
          setStatus: input.setStatus,
          signal: input.turnRef.current?.signal,
          text,
          modelSelection,
        });
        return;
      }

      await submitIdleTurn({
        applyResult: input.applyResult,
        applySessionEvent: input.applySessionEvent,
        draftAttachments: input.draftAttachmentsRef.current,
        options: input.options,
        requestPermission: input.requestPermission,
        setBusy: input.setBusy,
        setDraftAttachments: input.setDraftAttachments,
        setDraftValue: input.setDraftValue,
        setLastError: input.setLastError,
        setLiveModelText: input.setLiveModelText,
        setMessages: input.setMessages,
        setSelection: input.setSelection,
        setSlashSelection: input.setSlashSelection,
        setStatus: input.setStatus,
        setStatusDetails: input.setStatusDetails,
        submitOptions: options,
        text,
        modelSelection,
        turnRef: input.turnRef,
      });
    },
    [input],
  );
}

const EXIT_COMMANDS = new Set(["/exit", "/quit"]);

export function isExitCommand(text: string): boolean {
  return EXIT_COMMANDS.has(text.trim().toLowerCase());
}

const MCP_COMMAND = "/mcp";

export function isMcpCommand(text: string): boolean {
  return text.trim().toLowerCase() === MCP_COMMAND;
}

const REVIEW_COMMAND = "/review";

export function isReviewCommand(text: string): boolean {
  return text.trim().toLowerCase() === REVIEW_COMMAND;
}

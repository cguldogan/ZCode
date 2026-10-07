// /review controller hook (specs/tui/diff-review-undo.md §1): owns only transient view state and
// executes the reducer's effects against the injected `TuiWorkspaceReview` provider.
import type { KeyEvent } from "@mbears/opentui-core";
import type { TuiCopy } from "@zcode/i18n";
import React from "react";
import {
  applyReviewDiff,
  applyReviewListing,
  openReviewPanel,
  reduceReviewKey,
  type ReviewEffect,
  type ReviewPanelState,
} from "./app-review-state.js";
import type { TuiReviewFailure, TuiWorkspaceReview } from "./types.js";

/** The subset of OpenTUI's ScrollBoxRenderable the diff view needs for j/k scrolling. */
export type ReviewScrollTarget = { scrollBy(delta: number): void };

export type ReviewPanelController = {
  close(): void;
  handleKey(key: KeyEvent): boolean;
  open(): void;
  scrollRef: React.MutableRefObject<ReviewScrollTarget | null>;
  state?: ReviewPanelState;
};

const LOAD_FAILED: TuiReviewFailure = { kind: "git_failed" };

export function useReviewPanel(input: {
  copy: TuiCopy;
  provider?: TuiWorkspaceReview;
  setStatus: (status: string) => void;
}): ReviewPanelController {
  const [state, setStateValue] = React.useState<ReviewPanelState | undefined>();
  const stateRef = React.useRef<ReviewPanelState | undefined>(undefined);
  const abortRef = React.useRef<AbortController | undefined>(undefined);
  const scrollRef = React.useRef<ReviewScrollTarget | null>(null);
  const { copy, provider, setStatus } = input;

  const setState = React.useCallback(
    (update: (current: ReviewPanelState | undefined) => ReviewPanelState | undefined) => {
      stateRef.current = update(stateRef.current);
      setStateValue(stateRef.current);
    },
    [],
  );

  const runEffect = React.useCallback(
    (effect: ReviewEffect | undefined) => {
      if (!effect) return;
      if (effect.type === "scroll") {
        scrollRef.current?.scrollBy(effect.delta);
        return;
      }
      abortRef.current?.abort();
      if (effect.type === "close") {
        abortRef.current = undefined;
        setState(() => undefined);
        setStatus(copy.review.closed);
        return;
      }
      if (!provider) return;
      const controller = new AbortController();
      abortRef.current = controller;
      const options = { abortSignal: controller.signal };
      if (effect.type === "loadList") {
        void provider.listChanges(options).then(
          (listing) => setState((s) => s && applyReviewListing(s, effect.requestId, listing)),
          () => setState((s) => s && applyReviewListing(s, effect.requestId, LOAD_FAILED)),
        );
        return;
      }
      void provider.loadFileDiff(effect.file, options).then(
        (result) => setState((s) => s && applyReviewDiff(s, effect.requestId, result)),
        () => setState((s) => s && applyReviewDiff(s, effect.requestId, LOAD_FAILED)),
      );
    },
    [copy, provider, setState, setStatus],
  );

  const open = React.useCallback(() => {
    if (!provider) {
      setStatus(copy.review.unavailable);
      return;
    }
    const opened = openReviewPanel(stateRef.current);
    setState(() => opened.state);
    setStatus(copy.review.listHelp);
    runEffect(opened.effect);
  }, [copy, provider, runEffect, setState, setStatus]);

  const close = React.useCallback(() => runEffect({ type: "close" }), [runEffect]);

  const handleKey = React.useCallback(
    (key: KeyEvent): boolean => {
      const current = stateRef.current;
      if (!current) return false;
      const result = reduceReviewKey(current, key);
      if (result.state !== current) {
        setState(() => result.state);
        if (result.state.view !== current.view) {
          setStatus(result.state.view === "diff" ? copy.review.diffHelp : copy.review.listHelp);
        }
      }
      runEffect(result.effect);
      return result.consumed;
    },
    [copy, runEffect, setState, setStatus],
  );

  React.useEffect(() => () => abortRef.current?.abort(), []);

  return { close, handleKey, open, scrollRef, state };
}

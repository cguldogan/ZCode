// /mcp manager controller hook (specs/tui/mcp-manager.md): owns only transient view state and
// executes the reducer's effects against the injected TuiMcpManager provider.
import type { KeyEvent } from "@mbears/opentui-core";
import type { TuiCopy } from "@zcode/i18n";
import React from "react";
import {
  applyMcpActionResult,
  applyMcpListing,
  openMcpPanel,
  reduceMcpKey,
  type McpEffect,
  type McpPanelState,
} from "./app-mcp-state.js";
import type { TuiMcpActionResult, TuiMcpManager } from "./mcp-manager-types.js";

export type McpPanelController = {
  close(): void;
  handleKey(key: KeyEvent): boolean;
  open(): void;
  state?: McpPanelState;
};

export function useMcpPanel(input: {
  copy: TuiCopy;
  manager?: TuiMcpManager;
  /** Called after a toggle/reconnect so the sidebar refreshes immediately instead of on its poll. */
  onChanged: () => void;
  setStatus: (status: string) => void;
}): McpPanelController {
  const [state, setStateValue] = React.useState<McpPanelState | undefined>();
  const stateRef = React.useRef<McpPanelState | undefined>(undefined);
  const { copy, manager, onChanged, setStatus } = input;

  const setState = React.useCallback(
    (update: (current: McpPanelState | undefined) => McpPanelState | undefined) => {
      stateRef.current = update(stateRef.current);
      setStateValue(stateRef.current);
    },
    [],
  );

  const runEffect = React.useCallback(
    (effect: McpEffect | undefined) => {
      if (!effect) return;
      if (effect.type === "close") {
        setState(() => undefined);
        setStatus(copy.mcp.closed);
        return;
      }
      if (!manager) return;
      if (effect.type === "load") {
        void manager.list().then(
          (entries) => setState((s) => s && applyMcpListing(s, effect.requestId, entries)),
          () => setState((s) => s && applyMcpListing(s, effect.requestId, undefined)),
        );
        return;
      }
      const action = effect.type;
      const request =
        effect.type === "setEnabled"
          ? manager.setEnabled(effect.name, effect.enabled)
          : manager.reconnect(effect.name);
      void request
        .catch(
          (error: unknown): TuiMcpActionResult => ({
            code: "apply_failed",
            message: error instanceof Error ? error.message : String(error),
            ok: false,
          }),
        )
        .then((result) => {
          setState((s) => s && applyMcpActionResult(s, effect.name, action, result));
          onChanged();
        });
    },
    [copy, manager, onChanged, setState, setStatus],
  );

  const open = React.useCallback(() => {
    if (!manager) {
      setStatus(copy.mcp.unavailable);
      return;
    }
    const opened = openMcpPanel(stateRef.current);
    setState(() => opened.state);
    setStatus(copy.mcp.listHelp);
    runEffect(opened.effect);
  }, [copy, manager, runEffect, setState, setStatus]);

  const close = React.useCallback(() => runEffect({ type: "close" }), [runEffect]);

  const handleKey = React.useCallback(
    (key: KeyEvent): boolean => {
      const current = stateRef.current;
      if (!current) return false;
      const result = reduceMcpKey(current, key);
      if (result.state !== current) setState(() => result.state);
      runEffect(result.effect);
      return result.consumed;
    },
    [runEffect, setState],
  );

  return { close, handleKey, open, state };
}

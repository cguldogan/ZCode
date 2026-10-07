import type { KeyEvent } from "@mbears/opentui-core";
import type { Dispatch, SetStateAction } from "react";
import { handleSidebarShortcutKey } from "./app-sidebar-keyboard.js";
import type { SidebarSectionId } from "./app-sidebar-layout.js";
import type { SidebarShortcutState } from "./app-sidebar-shortcut.js";

/** Keys the focused read-only scrollbox handles natively; everything else is swallowed. */
const READ_ONLY_SCROLL_KEYS = new Set([
  "up",
  "down",
  "left",
  "right",
  "pageup",
  "pagedown",
  "home",
  "end",
]);

/**
 * Read-only views (subagent transcript): sidebar shortcuts, Esc back, Ctrl+C/Ctrl+Y copy, and
 * native scrolling. Extracted from app-keyboard.ts unchanged to keep that file within limits.
 */
export function handleReadOnlyViewKey(input: {
  consumeKey: (key: KeyEvent) => void;
  copyCurrentSelection: () => boolean;
  key: KeyEvent;
  readOnlyView: { back(): void };
  setStatus: Dispatch<SetStateAction<string>>;
  shortcutState: SidebarShortcutState;
  toggleSidebar: () => boolean;
  toggleSidebarSection: (section: SidebarSectionId) => boolean;
}): void {
  const { consumeKey, key } = input;
  if (
    handleSidebarShortcutKey({
      consumeKey,
      key,
      nowMs: Date.now(),
      setStatus: input.setStatus,
      shortcutState: input.shortcutState,
      toggleSidebar: input.toggleSidebar,
      toggleSidebarSection: input.toggleSidebarSection,
    })
  )
    return;
  if (key.name === "escape") {
    consumeKey(key);
    input.readOnlyView.back();
  } else if ((key.name === "c" || key.name === "y") && key.ctrl) {
    consumeKey(key);
    input.copyCurrentSelection();
  } else if (!READ_ONLY_SCROLL_KEYS.has(key.name)) {
    consumeKey(key);
  }
}

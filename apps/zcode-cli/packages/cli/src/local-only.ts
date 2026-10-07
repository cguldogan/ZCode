// Local-only fork: Z.ai/BigModel accounts are removed.
// Spec: specs/self-hosted-build/remote-updates-and-litellm.md §7.
export { ZCODE_VENDOR_ACCOUNTS_ENABLED } from "@zcode/shared";

export const LOCAL_ONLY_ACCOUNT_MESSAGE =
  "Not available in this local-only build: Z.ai/BigModel accounts are disabled. " +
  "Use a local provider such as LiteLLM (configure it in the desktop app under Settings → Model settings).";

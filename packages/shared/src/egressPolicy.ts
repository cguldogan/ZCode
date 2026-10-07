/**
 * China egress block for the self-hosted build.
 * Spec: specs/self-hosted-build/remote-updates-and-litellm.md §6.
 *
 * Single owner of the decision: Node processes (installChinaEgressGuard) and Electron
 * sessions (webRequest filter) both consult this matcher, so a host is blocked everywhere
 * or nowhere.
 */

export const ZCODE_EGRESS_BLOCKED_CODE = "ZCODE_EGRESS_BLOCKED";

/** Registrable domains (and all their subdomains) operated in or for mainland China. */
export const CHINA_EGRESS_BLOCKED_HOST_SUFFIXES: readonly string[] = [
  // Vendor: Zhipu AI / Z.ai control plane, CDN, accounts and model APIs.
  "z.ai",
  "bigmodel.cn",
  "zhipuai.cn",
  // Alibaba Cloud: ARMS telemetry, DashScope, CDN and accelerator front ends.
  "aliyuncs.com",
  "aliyun.com",
  "alicdn.com",
  "alibabacloud.com",
  "initaa.com",
  "cdngslb.com",
  // Tencent (WeChat iLink bots) and ByteDance (Lark/Feishu bots).
  "qq.com",
  "larksuite.com",
  // Chinese model APIs and package mirrors.
  "deepseek.com",
  "minimaxi.com",
  "minimax.io",
  "xiaomimimo.com",
  "npmmirror.com",
];

// Alibaba Global Accelerator and WAF front ends use numbered registrable domains.
const CHINA_EGRESS_BLOCKED_HOST_PATTERNS: readonly RegExp[] = [
  /(?:^|\.)aliyunga\d*\.com$/,
  /(?:^|\.)yundunwaf\d*\.com$/,
];

function normalizeHost(host: string): string {
  let value = host.trim().toLowerCase();
  if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1);
  return value.replace(/\.+$/, "");
}

/** True when a connection to `host` would leave for a China-operated service. */
export function isChinaEgressBlockedHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const normalized = normalizeHost(host);
  if (!normalized) return false;
  if (normalized === "cn" || normalized.endsWith(".cn")) return true;
  if (
    CHINA_EGRESS_BLOCKED_HOST_SUFFIXES.some(
      (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`),
    )
  ) {
    return true;
  }
  return CHINA_EGRESS_BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** URL form of the same rule; non-network schemes (file:, data:, blob:) are never blocked. */
export function isChinaEgressBlockedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!/^(?:https?|wss?|ftp):$/.test(parsed.protocol)) return false;
    return isChinaEgressBlockedHost(parsed.hostname);
  } catch {
    return false;
  }
}

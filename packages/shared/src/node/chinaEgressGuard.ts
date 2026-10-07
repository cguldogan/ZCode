import net from "node:net";
import { isChinaEgressBlockedHost, ZCODE_EGRESS_BLOCKED_CODE } from "../egressPolicy.js";

// Spec: specs/self-hosted-build/remote-updates-and-litellm.md §6.
// Every TCP/TLS client in Node (fetch/undici, http(s), tls, ws) ends in
// net.Socket#connect with the requested hostname, before any DNS lookup. Guarding that
// one method covers current and future call sites, including ones an upstream merge adds.

const INSTALLED = Symbol.for("zcode.chinaEgressGuard.installed");

export class EgressBlockedError extends Error {
  readonly code = ZCODE_EGRESS_BLOCKED_CODE;
  constructor(readonly host: string) {
    super(
      `Connection to ${host} blocked: self-hosted build does not contact China-operated services`,
    );
    this.name = "EgressBlockedError";
  }
}

export interface ChinaEgressGuardOptions {
  /** Observability only; must not throw. */
  readonly onBlocked?: (host: string) => void;
}

/** Hostname a Socket#connect call targets, or undefined for IPC paths and fd handles. */
export function resolveSocketConnectHost(args: readonly unknown[]): string | undefined {
  // net.connect() passes its normalized [options, callback] tuple as the first argument.
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (first && typeof first === "object") {
    const options = first as { host?: unknown; path?: unknown };
    if (typeof options.path === "string") return undefined;
    return typeof options.host === "string" ? options.host : "localhost";
  }
  if (typeof first === "number" || (typeof first === "string" && /^\d+$/.test(first))) {
    return typeof args[1] === "string" ? args[1] : "localhost";
  }
  return undefined;
}

export function installChinaEgressGuard(options: ChinaEgressGuardOptions = {}): void {
  const prototype = net.Socket.prototype as net.Socket & { [INSTALLED]?: true };
  if (prototype[INSTALLED]) return;
  const originalConnect = prototype.connect;
  const guardedConnect = function (this: net.Socket, ...args: unknown[]) {
    const host = resolveSocketConnectHost(args);
    if (host !== undefined && isChinaEgressBlockedHost(host)) {
      try {
        options.onBlocked?.(host);
      } catch {
        /* observers cannot change the decision */
      }
      const error = new EgressBlockedError(host);
      // Fail like a refused connection: asynchronously, so callers attach listeners first.
      process.nextTick(() => this.destroy(error));
      return this;
    }
    return (originalConnect as (...connectArgs: unknown[]) => net.Socket).apply(this, args);
  };
  Object.defineProperty(prototype, "connect", {
    value: guardedConnect,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(prototype, INSTALLED, { value: true });
}

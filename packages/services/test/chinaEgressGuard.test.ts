import assert from "node:assert/strict";
import dns from "node:dns";
import { createServer } from "node:http";
import https from "node:https";
import net from "node:net";
import test from "node:test";
import {
  isChinaEgressBlockedHost,
  isChinaEgressBlockedUrl,
  ZCODE_EGRESS_BLOCKED_CODE,
} from "@zcode/shared";
import { installChinaEgressGuard, resolveSocketConnectHost } from "@zcode/shared/node";

// Spec: specs/self-hosted-build/remote-updates-and-litellm.md §6.

test("blocks the vendor, Alibaba Cloud, Chinese model APIs and every .cn host", () => {
  for (const host of [
    "z.ai",
    "zcode.z.ai",
    "cdn-zcode.z.ai",
    "API.Z.AI.",
    "open.bigmodel.cn",
    "dashscope-intl.aliyuncs.com",
    "zcode.z.ai.a1.initaa.com",
    "cdn-zcode.z.ai.w.cdngslb.com",
    "ga-bp1xx4zeq2vdhs6phnk7v.aliyunga0018.com",
    "all.bigmodel.cn.c.yundunwaf2.com",
    "ilinkai.weixin.qq.com",
    "open.larksuite.com",
    "api.deepseek.com",
    "api.moonshot.cn",
    "registry.npmmirror.com",
    "example.com.cn",
  ]) {
    assert.equal(isChinaEgressBlockedHost(host), true, host);
  }
});

test("leaves local and non-Chinese services alone", () => {
  for (const host of [
    "localhost",
    "127.0.0.1",
    "::1",
    "[::1]",
    "100.90.44.53",
    "api.openai.com",
    "api.anthropic.com",
    "openrouter.ai",
    "github.com",
    "registry.npmjs.org",
    "notz.ai",
    "cnn.com",
    "",
  ]) {
    assert.equal(isChinaEgressBlockedHost(host), false, host);
  }
  assert.equal(isChinaEgressBlockedHost(undefined), false);
});

test("URL form only applies to network schemes", () => {
  assert.equal(isChinaEgressBlockedUrl("https://zcode.z.ai/api/v1/client/configs"), true);
  assert.equal(isChinaEgressBlockedUrl("wss://chat.z.ai/socket"), true);
  assert.equal(isChinaEgressBlockedUrl("https://api.openai.com/v1/models"), false);
  assert.equal(isChinaEgressBlockedUrl("file:///Users/me/z.ai/index.html"), false);
  assert.equal(isChinaEgressBlockedUrl("data:text/plain,z.ai"), false);
  assert.equal(isChinaEgressBlockedUrl("not a url"), false);
});

test("reads the target host from every Socket#connect calling convention", () => {
  assert.equal(resolveSocketConnectHost([{ host: "zcode.z.ai", port: 443 }]), "zcode.z.ai");
  assert.equal(resolveSocketConnectHost([[{ host: "api.z.ai", port: 443 }, () => {}]]), "api.z.ai");
  assert.equal(resolveSocketConnectHost([443, "chat.z.ai"]), "chat.z.ai");
  assert.equal(resolveSocketConnectHost([4000]), "localhost");
  assert.equal(resolveSocketConnectHost([{ port: 4000 }]), "localhost");
  assert.equal(resolveSocketConnectHost([{ path: "/tmp/zcode.sock" }]), undefined);
  assert.equal(resolveSocketConnectHost(["/tmp/zcode.sock"]), undefined);
});

test("installed guard stops fetch, https and net to blocked hosts before DNS, not localhost", async () => {
  const blockedHosts: string[] = [];
  const lookedUp: string[] = [];
  const originalLookup = dns.lookup;
  (dns as { lookup: unknown }).lookup = function (hostname: string, ...rest: unknown[]) {
    lookedUp.push(hostname);
    return (originalLookup as (...args: unknown[]) => unknown).call(dns, hostname, ...rest);
  };
  installChinaEgressGuard({ onBlocked: (host) => blockedHosts.push(host) });
  installChinaEgressGuard(); // idempotent

  const server = createServer((_req, res) => res.end("ok"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  try {
    const local = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(await local.text(), "ok");

    await assert.rejects(fetch("https://zcode.z.ai/api/v1/client/configs"), (error: unknown) => {
      const cause = (error as { cause?: { code?: string } }).cause;
      return cause?.code === ZCODE_EGRESS_BLOCKED_CODE;
    });

    const httpsError = await new Promise<NodeJS.ErrnoException>((resolve) => {
      https
        .get("https://open.bigmodel.cn/api/anthropic", () => resolve(new Error("connected")))
        .on("error", resolve);
    });
    assert.equal(httpsError.code, ZCODE_EGRESS_BLOCKED_CODE);

    const netError = await new Promise<NodeJS.ErrnoException>((resolve) => {
      net.connect({ host: "dashscope.aliyuncs.com", port: 443 }).on("error", resolve);
    });
    assert.equal(netError.code, ZCODE_EGRESS_BLOCKED_CODE);

    assert.deepEqual(blockedHosts, ["zcode.z.ai", "open.bigmodel.cn", "dashscope.aliyuncs.com"]);
    assert.equal(
      lookedUp.some((host) => isChinaEgressBlockedHost(host)),
      false,
      `DNS lookups leaked: ${lookedUp.join(", ")}`,
    );
  } finally {
    (dns as { lookup: unknown }).lookup = originalLookup;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// `/mcp` manager copy (specs/tui/mcp-manager.md); kept apart so zh-CN.ts stays under the line limit.
import type { ZCodeCopy } from "../types.js";

export const zhCNMcpManagerCopy: ZCodeCopy["tui"]["mcp"] = {
  title: " MCP ",
  listHelp: "上下移动 · 空格启停 · r 重连 · t 工具 · R 刷新 · Esc 关闭",
  header: ({ connected, disabled, enabled }) =>
    `${connected}/${enabled} 已连接${disabled > 0 ? `，${disabled} 已禁用` : ""}`,
  loading: "正在加载 MCP 服务...",
  empty: "未配置 MCP server。",
  loadFailed: "无法获取 MCP 状态，按 R 重试。",
  unavailable: "当前客户端不支持 MCP 管理。",
  closed: "已关闭 MCP 管理。",
  pendingApproval: "有待处理的审批请求，按 Esc 返回处理。",
  working: "处理中...",
  noTools: "无工具",
  toolsHeading: (count) => `${count} 个工具：`,
  status: {
    connected: "已连接",
    connecting: "连接中",
    disabled: "已禁用",
    disconnected: "未连接",
    failed: "失败",
    needsAuth: "待授权",
    untrusted: "未信任",
  },
  origin: {
    builtin: "内置",
    cli: "命令行",
    env: "环境变量",
    host: "宿主",
    plugin: "插件",
    project: "项目",
    system: "系统",
    user: "用户",
  },
  notice: {
    disabled: (name) => `已禁用 ${name}，其工具已从当前会话移除。`,
    enabled: (name) => `已启用 ${name}。`,
    failed: ({ message, name }) => `${name}：${message}`,
    needsEnabled: (name) => `${name} 已禁用，请先启用（空格）。`,
    readOnlyBuiltin: ({ name, plugins }) =>
      `${name} 由 ${plugins || "插件"} 提供，请用 /plugins disable <id> 管理。`,
    readOnlyOther: ({ name, origin }) => `${name} 来自${origin}配置，无法在此启停。`,
    readOnlyPlugin: ({ name, plugins }) =>
      `${name} 由插件 ${plugins || "（未知）"} 提供，请用 /plugins 管理。`,
    reconnected: (name) => `已重连 ${name}。`,
  },
};

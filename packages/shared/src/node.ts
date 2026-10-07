/**
 * Node-only shared utilities.
 *
 * This subpath must not be imported by renderer/browser bundles.
 */
export { acquireFileLock } from "./node/atomicFileLock.js";
export {
  EgressBlockedError,
  installChinaEgressGuard,
  resolveSocketConnectHost,
  type ChinaEgressGuardOptions,
} from "./node/chinaEgressGuard.js";
export {
  checkGitHubBuildUpdate,
  GITHUB_BUILD_UPDATE_TIMEOUT_MS,
  type CheckGitHubBuildUpdateOptions,
} from "./node/githubBuildUpdate.js";
export { scanOfficialPluginCacheRoots } from "./node/officialPluginCache.js";
export {
  migrateUserSubagentMarkdown,
  migrateSubagentStateFile,
} from "./node/subagentMarkdownMigration.js";
export {
  atomicWritePrivateTextFile,
  backupCorruptFile,
  withFileLock,
  type SharedFileLockOptions,
} from "./node/privateFilePersistence.js";
export {
  createNodeSelfResourceSampler,
  NODE_SELF_RESOURCE_SAMPLE_INTERVAL_MS,
  type NodeSelfResourceSampler,
  type NodeSelfResourceSamplerOptions,
} from "./node/nodeSelfResourceTelemetry.js";

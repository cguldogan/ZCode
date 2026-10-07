# Check for updates from GitHub

Status: accepted · Scope: desktop main + renderer toast, CLI `zcode update`,
`.github/scripts/publish-release.sh` · Owner: `checkGitHubBuildUpdate`
(`packages/shared/src/node/githubBuildUpdate.ts`)

ZCode Beyond keeps the vendor updater off (`ZCODE_REMOTE_UPDATES_ENABLED=false`,
see `remote-updates-and-litellm.md`). Instead, the user can ask whether a newer
build of this fork exists on GitHub. The app only **reports**; it never downloads
or installs anything.

## 1. Product rules

- **Manual only.** No check at startup, on a timer or in the background. The only
  triggers are the desktop menu item *Check for Updates…* and the CLI command
  `zcode update`. Without one of those actions the app makes no update request.
- **Channel: rolling `latest`.** Every push to `main` publishes the prerelease
  tagged `latest` (`ci-release.md` §4). A build is identified by the git commit it
  was built from, not by the `package.json` version (which does not change between
  rolling builds).
- **Notify + open download.** When a newer build exists, the app shows how many
  commits it is behind and the newest commit subjects, and offers to open the
  release page `https://github.com/<repo>/releases/tag/latest` in the browser.
- **Hosts.** Only `api.github.com` is contacted, and the browser is pointed at
  `github.com`. No token, cookie, device id or other identifier is sent: the request
  carries only `Accept`, `X-GitHub-Api-Version` and a
  `User-Agent: ZCode-Beyond-UpdateCheck` header.

## 2. Build identity

| Build                   | Commit source                                                     |
| ----------------------- | ----------------------------------------------------------------- |
| Desktop (main/renderer) | `__ZCODE_COMMIT__` = `git rev-parse --short=8 HEAD` (existing)     |
| CLI (`zcode.cjs`, SEA)  | `__ZCODE_COMMIT__` = same, added to `scripts/build.mjs` defines    |

Both read it through `ZCODE_COMMIT` (`packages/shared/src/version.ts`); it is
`"unknown"` when the build ran outside a git checkout.

## 3. Release marker

The rolling release notes end with a machine-readable marker, invisible in the
rendered Markdown:

```text
<!-- zcode-beyond-build {"commit":"<40-hex sha>","version":"<package.json version>"} -->
```

`publish-release.sh rolling` writes the title and notes (and so the marker)
**after** all assets are uploaded. The marker therefore names a commit only once
that commit's files are in the release. The `latest` tag still moves first
(so a recreated release never attaches to a stale tag), but the check does not read
the tag. A versioned `v*` release does not carry the marker and is not part of
this channel.

## 4. Check algorithm (single owner)

```text
user action        checkGitHubBuildUpdate                         api.github.com
  │ menu / zcode update │                                                │
  │────────────────────▶│ GET /repos/<repo>/releases/tags/latest ───────▶│
  │                     │◀── body (marker), html_url ────────────────────│
  │                     │ marker.commit startsWith local? → up-to-date   │
  │                     │ local commit unknown?           → unknown-build│
  │                     │ GET /repos/<repo>/compare/<local>...<latest> ─▶│
  │                     │◀── status, ahead_by, behind_by, commits ───────│
  │◀── result ──────────│                                                │
```

| Compare outcome           | Result kind          | Meaning                                         |
| ------------------------- | -------------------- | ----------------------------------------------- |
| marker commit == local    | `up-to-date`         |                                                 |
| `ahead` / `diverged`      | `update-available`   | `commitsBehind = ahead_by`, newest 5 subjects   |
| `behind`                  | `newer-than-latest`  | local build is ahead of the published build     |
| `identical`               | `up-to-date`         | (short vs full sha of the same commit)          |
| HTTP 404 on compare       | `unknown-build`      | local commit not on GitHub (local/unpushed)     |
| local commit `"unknown"`  | `unknown-build`      | no compare request is made                      |
| HTTP 404 on release       | `no-release`         | nothing published yet                           |
| no/invalid marker         | `error`              | release predates this feature                   |
| network, 403/429, timeout | `error`              | message names the cause; 10 s timeout           |

`unknown-build` still reports the latest commit and the download URL. Every result
carries `currentCommit`, and every result except `no-release` and `error` carries
`latestCommit` and `downloadUrl`.
The function takes `repository`, `currentCommit`, `fetch` and `signal` as inputs
and has no module state; callers own the trigger and the presentation. Concurrent
manual checks are harmless (idempotent GETs) and each caller shows its own result.

## 5. Surfaces

### Desktop

- *Check for Updates…* stays in the app/Help menu and the Windows title-bar
  help menu (production flavor, as before).
- `DesktopCommandIds.CheckForUpdates`: when `ZCODE_REMOTE_UPDATES_ENABLED` is
  false, main runs `checkGitHubBuildUpdate` (Node `fetch`, so the China egress
  guard still applies) and sends `UpdateCheckResultPayload` `{ kind: "github-build",
  result }` to the window that asked. The vendor updater path is unchanged and still
  fails closed.
- Renderer (`useRootPlatformEffects`): one toast per result. `update-available` and
  `unknown-build` get an **Open download page** action, which calls
  `IPlatformService.openExternal(downloadUrl)`. Strings live in both locale files under
  `update.github.*`.

### CLI

`zcode update` prints the result and exits:
`0` up to date / newer, `10` update available, `1` error. `--json` prints the
result object. It never prompts, downloads or writes files.

## 6. Acceptance

1. Desktop, built from the commit of the current `latest` release → menu
   *Check for Updates…* → toast "You're on the latest build (<sha>)".
2. Desktop built from an older commit → toast "A newer build is available
   (N commits)" with *Open download page* → the browser opens the release page.
3. `zcode update` on an older build → prints the commits behind and the download
   URL, exit code 10; with `--json` prints the result object.
4. Network off → toast/CLI error, no retry loop.
5. No check request is made when the app starts or idles (only on the two triggers).
6. A publish run that fails while uploading leaves the marker at the previous
   commit, so the check never points users at a build whose files are missing.

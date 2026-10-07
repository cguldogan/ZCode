# CI, release builds and download site

Status: proposed · Scope: `.github/`, `site/` · Owner: repository maintainer

GitHub Actions checks every change, builds unsigned installers and CLI packages,
publishes them as GitHub releases, and deploys a static download page to GitHub
Pages. No third-party build service, signing service or mirror is involved.

## 1. Workflows and triggers

| Workflow      | Triggers                                                                                             | Writes                       |
| ------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------- |
| `ci.yml`      | every `push`, every `pull_request`, `workflow_dispatch`                                              | nothing (`contents: read`)   |
| `release.yml` | `push` to `main`, `push` of a `v*` tag, `workflow_dispatch`                                          | releases (`contents: write`) |
| `pages.yml`   | `push` to `main` touching `site/**`, the logo, `package.json`, or its own files; `workflow_dispatch` | Pages deployment             |

- `release.yml` ignores pushes to `main` that only change Markdown, `site/**`,
  `ci.yml` or `pages.yml` (path filters do not apply to tag pushes).
- `workflow_dispatch` on `release.yml` only builds (artifacts kept 14 days)
  unless the `publish` input is ticked; it then publishes like a push of the
  same ref (`main` → rolling, `v*` tag → versioned). Other refs never publish.
- Runs of `release.yml` for the same ref are serialized
  (`cancel-in-progress: false`), so a newer push never interrupts an asset upload.

## 2. CI checks (`ci.yml`, ubuntu-24.04)

`pnpm install --frozen-lockfile`, then `pnpm typecheck`, `pnpm lint`,
`pnpm architecture:check`, `pnpm --filter "@zcode/cli..." build`, the CLI
workspace typecheck (`pnpm exec turbo --skip-infer --cwd apps/zcode-cli run typecheck`)
and the `node:test` suites of `packages/services`, `packages/ui`,
`apps/zcode-cli/packages/cli` (`node --import tsx --test test/*.test.ts`) and
`apps/zcode-cli/packages/tui` (`tsx --test`, after the CLI build because the tests
import sibling dists). `pnpm fmt:check` is not part of CI because the current baseline
fails it.

## 3. Release builds (`release.yml`)

| Job       | Runner                   | Produces                                                                                                                                        | Required           |
| --------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| desktop   | `macos-15`               | `ZCode-Beyond-mac-arm64.dmg`, `.zip`                                                                                                            | yes                |
| desktop   | `macos-15-intel`         | `ZCode-Beyond-mac-x64.dmg`, `.zip`                                                                                                              | no                 |
| desktop   | `ubuntu-24.04`           | `ZCode-Beyond-linux-x64.AppImage`, `.deb` (+ `.rpm`, `.pkg.tar.zst` when produced)                                                              | no                 |
| desktop   | `windows-2025`           | `ZCode-Beyond-win-x64-setup.exe`                                                                                                                | no                 |
| cli       | `macos-15`               | `zcode-beyond-cli-{mac-arm64,mac-x64,linux-x64,linux-arm64}.tar.gz`, `zcode-beyond-cli-{win-x64,win-arm64}.zip`, `zcode-beyond-cli-node.tar.gz` | mac-arm64 only     |
| cli-smoke | native runner per target | `zcode --version` on mac-x64, linux-x64, linux-arm64, win-x64                                                                                   | no (informational) |
| publish   | `ubuntu-24.04`           | the release                                                                                                                                     | —                  |

- Desktop: `pnpm bundle:desktop -- --os <os> --arch <arch>` with
  `ZCODE_ENV=production NODE_ENV=production` (on that step only), the recipe proven
  locally. Each job builds natively on its own OS/arch because `node-pty` is
  rebuilt for the host by the desktop `postinstall`.
- CLI: single executables from the repository's own SEA pipeline
  (`apps/zcode-cli/packages/cli/scripts/build-sea.mjs`). One macOS host builds
  every target: the SEA blob is platform-neutral (no code cache, no snapshot), the
  target Node.js binary comes from nodejs.org with its SHASUMS256 check, and darwin
  binaries need `codesign` for the ad-hoc signature. The darwin-arm64 binary is
  smoke-tested by the build itself. The `pnpm build:zcode` tarball is published as
  `zcode-beyond-cli-node.tar.gz` (best-effort): it adds `zcode --web` but needs
  Node.js 24; its generated `install.sh`/`latest.json` are not published because
  they expect a `releases/<version>/` layout that GitHub releases do not have.
- Naming: stable, space-free names as above, independent of the version, so links
  never change. electron-builder's own names (`ZCode Beyond-<version>-…`) are mapped
  by `.github/scripts/collect-desktop-artifacts.sh`.
- Checksums: every file gets `<file>.sha256` (`sha256sum -c` format); the publish
  job verifies all of them and writes `SHA256SUMS.txt`.

## 4. Publishing and stable links

| Event            | Release                                                                            | Stable link                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| push to main     | tag `latest`, **prerelease**, updated in place                                     | `https://github.com/<repo>/releases/download/latest/<file>`                                                                 |
| push of `vX.Y.Z` | tag `vX.Y.Z`, normal release (prerelease if the tag contains `-`), generated notes | `https://github.com/<repo>/releases/download/vX.Y.Z/<file>` and `https://github.com/<repo>/releases/latest/download/<file>` |

GitHub resolves `/releases/latest` to the newest **non-prerelease**. The rolling
build is therefore a prerelease under the tag `latest` and is linked through
`/releases/download/latest/…`; it can never shadow a versioned release, and
`/releases/latest/download/…` keeps meaning "newest versioned release" (it 404s
until the first `v*` tag). The download page links the rolling build.

Rolling update order (`.github/scripts/publish-release.sh rolling`):

```text
publish job                         GitHub
   │ tag ref latest exists?           │
   │──PATCH git/refs/tags/latest ────▶│ tag → GITHUB_SHA (POST if missing)
   │──release view latest ───────────▶│
   │──release edit (title, notes) ───▶│ (or release create … --prerelease)
   │──delete-asset for names this ───▶│ removes outputs of platforms that
   │  build did not produce           │ failed this time (no stale binaries)
   │──release upload --clobber ──────▶│ each asset replaced in place
```

The tag moves before the release is touched, so a recreated release can never
attach to a stale tag. Updating in place keeps links working except while a
single asset is being replaced. A tag push whose release already exists (re-run)
only refreshes assets and keeps edited notes. A `v*` tag that differs from the
root `package.json` version produces a warning: the app's About box shows the
`package.json` version.

## 5. Failure semantics

- Best-effort desktop jobs and the cli-smoke matrix use job-level
  `continue-on-error`; their failure never blocks publishing.
- The publish job runs whenever the run is not cancelled and checks the required
  files itself: `ZCode-Beyond-mac-arm64.dmg`, `ZCode-Beyond-mac-arm64.zip`,
  `zcode-beyond-cli-mac-arm64.tar.gz`. If one is missing, nothing is published and
  the previous release stays untouched.
- A platform that failed is absent from that release (and removed from the rolling
  release); its download link returns 404 until a later build succeeds. The page
  says so.

## 6. Trust and egress rules

- Only `GITHUB_TOKEN`; `contents: write` only on the publish job, `pages: write` +
  `id-token: write` only on the Pages deploy job; everything else `contents: read`.
  Checkouts use `persist-credentials: false`.
- Actions: GitHub-owned `actions/*` and `pnpm/action-setup`, pinned to major
  versions; releases go through the `gh` CLI preinstalled on the runner.
- Downloads at build time: npm registry (`registry.npmjs.org`, `.npmrc`), Electron
  and electron-builder binaries from their **GitHub** release mirrors, Electron headers
  (electronjs.org, node-pty rebuild), Node.js binaries from nodejs.org (SEA). Native
  search tools come from archives committed in the repository.
- Never npmmirror.com, intranet hosts or any China-operated mirror/CDN. Both workflows
  set `ELECTRON_MIRROR` and `ELECTRON_BUILDER_BINARIES_MIRROR` explicitly (bundle.mjs
  falls back to npmmirror when they are unset), and the setup action fails if either is
  not an `https://github.com/` URL or an `.npmrc` names a China-operated registry.
  `ZCODE_SKIP_REMOTE_ASSETS=1` always. CI does not use mise, so the `ELECTRON_MIRROR`
  in `mise.toml` does not apply.
- Download site: plain HTML/CSS with one inline script that only highlights the visitor's
  OS; no external fonts, scripts, CDNs, analytics or cookies (enforced by a CSP meta
  tag). The repository slug and app version are injected at build time
  (`.github/scripts/build-site.sh`), so a repository rename only needs a re-deploy.

## 7. Unsigned artifacts

Nothing is code-signed or notarized: no certificates exist and
`CSC_IDENTITY_AUTO_DISCOVERY=false` keeps electron-builder from picking up a runner
keychain identity. macOS apps carry at most an ad-hoc signature (as in the proven local
build) and the darwin CLI binaries an ad-hoc `codesign`; Gatekeeper blocks the first launch
(right-click → Open, or `xattr -dr com.apple.quarantine "/Applications/ZCode Beyond.app"`).
Windows shows SmartScreen. Integrity is provided only by the SHA-256 files, which
come from the same release and therefore do not protect against a compromised account.

## 8. Acceptance scenarios

1. Push to `main` with a code change → CI green; Release publishes/updates the
   `latest` prerelease; `…/releases/download/latest/ZCode-Beyond-mac-arm64.dmg` downloads
   the new build; `/releases/latest` still points at the newest `v*` release (or 404s).
2. Windows job fails → the release still publishes; the Windows asset is removed from
   `latest`; the run shows the failed job.
3. macOS arm64 job fails → no publish step changes the release.
4. Push of `v1.0.0` → a normal release `v1.0.0` with a downloads table, install notes
   and generated notes; `…/releases/latest/download/<file>` resolves to it.
5. Push to `main` touching only `site/` → Pages redeploys, no installers are rebuilt.
6. Rename the repository and run `pages.yml` manually → every link on the page uses the
   new slug.

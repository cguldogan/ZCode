# ZCode Beyond

<div align="center">
  <img src="public/logo/icons/1024x1024.png" alt="ZCode Beyond" width="128" height="128" />

**An AI coding workspace for local LLMs — desktop app and `zcode` terminal CLI.**

[Download](https://cguldogan.github.io/zcode-beyond/) ·
[Releases](https://github.com/cguldogan/zcode-beyond/releases) ·
[Install](#install) · [Local models](#connect-a-local-model) · [Updates](#updates)

</div>

ZCode Beyond runs a coding agent against models **you** host (LiteLLM, or any
OpenAI-compatible server). It has no accounts, no telemetry and no remote control, and it
refuses to talk to China-operated services. It is a modified, independent derivative of
[ZCode](https://github.com/zai-org/ZCode) (Apache-2.0) and is not affiliated with or
endorsed by the ZCode authors or Zhipu AI. See [NOTICE.md](NOTICE.md).

## Highlights

- **Local models first:** a LiteLLM provider preset (`http://localhost:4000/v1`) and
  "Load models" discovery from any OpenAI-compatible server.
- **No vendor accounts:** Z.ai/BigModel login, coding plans and their providers are
  removed; `zcode login`/`logout` are disabled.
- **No China egress:** every process blocks connections to China-operated services (the
  vendor, Alibaba Cloud, Tencent, ByteDance Lark, Chinese model APIs, any `.cn` host)
  before DNS.
- **No telemetry, no remote control:** analytics and usage reporting are off at build
  time; no auto-update, forced update or remote provider configuration.
- **Update check on request:** _Check for Updates…_ and `zcode update` ask GitHub whether
  a newer build exists. Report only — nothing is downloaded or installed.
- **Terminal UI extras:** `/review` panel for uncommitted changes, `/undo` / `/redo` of the
  last agent turn's file edits, `tui.diffStyle` (`auto` | `stacked`), status line with
  tokens/s, and hold-to-delete-faster (Backspace held 3 s deletes by word).

## Install

Builds are published automatically for every commit on `main` — get them from the
[download page](https://cguldogan.github.io/zcode-beyond/) or the
[`latest` release](https://github.com/cguldogan/zcode-beyond/releases/tag/latest).
They are **unsigned**, so the first launch needs one extra step.

### Desktop app

| System              | File                                                                     |
| ------------------- | ------------------------------------------------------------------------ |
| macOS Apple silicon | `ZCode-Beyond-mac-arm64.dmg`                                             |
| macOS Intel         | `ZCode-Beyond-mac-x64.dmg`                                               |
| Windows x64         | `ZCode-Beyond-win-x64-setup.exe`                                         |
| Linux x64           | `ZCode-Beyond-linux-x64.AppImage`, `.deb`, `.rpm`, `.pkg.tar.zst` (Arch) |

- **macOS:** open the DMG and drag **ZCode Beyond** into Applications. On first launch,
  right-click the app → **Open** → **Open**. If macOS says the app is damaged:
  `xattr -dr com.apple.quarantine "/Applications/ZCode Beyond.app"`
- **Windows:** when SmartScreen says "Windows protected your PC", choose **More info** →
  **Run anyway**.
- **Linux:** `chmod +x ZCode-Beyond-linux-x64.AppImage && ./ZCode-Beyond-linux-x64.AppImage`,
  or `sudo apt install ./ZCode-Beyond-linux-x64.deb`.

The desktop app installs as **ZCode Beyond** (bundle id `io.github.cguldogan.zcodebeyond`,
Linux package `zcode-beyond`), so it can sit next to an official ZCode install.

### Terminal CLI (`zcode`)

A single executable with the terminal UI and the agent; no Node.js needed. macOS / Linux
(replace `mac-arm64` with `mac-x64`, `linux-x64` or `linux-arm64`):

```bash
curl -fLO https://github.com/cguldogan/zcode-beyond/releases/download/latest/zcode-beyond-cli-mac-arm64.tar.gz
tar -xzf zcode-beyond-cli-mac-arm64.tar.gz
mkdir -p ~/.local/bin
mv zcode-beyond-cli-mac-arm64/zcode ~/.local/bin/zcode
zcode --help
```

Make sure `~/.local/bin` is on your `PATH`. If you downloaded the archive with a browser on
macOS, clear the quarantine flag once: `xattr -d com.apple.quarantine ~/.local/bin/zcode`.
On Windows, unzip `zcode-beyond-cli-win-x64.zip` and run `zcode.exe`.

`zcode-beyond-cli-node.tar.gz` is the Node.js 24 build of the same CLI that also includes
the browser UI (`zcode --web`).

The command is still called `zcode` and keeps its data in `~/.zcode`. If you also have the
official ZCode CLI, check which one runs with `command -v zcode`.

### Verify a download

Every file has a matching `.sha256`, and all are listed in `SHA256SUMS.txt`:

```bash
shasum -a 256 -c zcode-beyond-cli-mac-arm64.tar.gz.sha256   # macOS
sha256sum -c ZCode-Beyond-linux-x64.AppImage.sha256         # Linux
```

## Connect a local model

1. Run a [LiteLLM](https://docs.litellm.ai/) proxy (default `http://localhost:4000`) or any
   other OpenAI-compatible server in front of your models.
2. In the desktop app open **Settings → Model settings**, add a provider and pick
   **LiteLLM**. Change the base URL if your server is not on `http://localhost:4000/v1`.
3. Enter the API key (any placeholder such as `sk-local` if the server has no auth).
4. Click **Load models** to import the models from `GET /v1/models`, or add names by hand.

The CLI uses the same provider configuration (`~/.zcode/v2/provider_config.json`), so set
the provider up once in the desktop app, or edit that file directly.

## Using the CLI

```bash
zcode                    # terminal UI in the current folder
zcode --mode yolo        # auto-approve tool calls (also: Shift+Tab, /mode)
zcode -p "explain src/"  # one-shot, non-interactive (auto-approves by default)
zcode update             # check GitHub for a newer build
zcode --help
```

| Where                                             | What                                              |
| ------------------------------------------------- | ------------------------------------------------- |
| `AGENTS.md` (project), `~/.zcode/AGENTS.md`       | Instructions added to every conversation          |
| `.zcode/` or `.agents/` in a project, `~/.zcode/` | `skills/`, `commands/`, `agents/`                 |
| `~/.zcode/cli/config.json`                        | CLI settings (`permission.mode`, `tui.diffStyle`) |

In the terminal UI, `/review` shows uncommitted changes, `/undo` and `/redo` revert or
reapply the last turn's file edits, and `/exit` quits.

## Updates

Nothing updates by itself. To find out whether a newer build exists:

- **Desktop:** app menu (macOS) or Help menu → **Check for Updates…**. If there is a newer
  build, the notice offers **Open download page**.
- **CLI:** `zcode update` prints the new commits and the download link. Exit code `0` = up
  to date, `10` = update available, `1` = error; `--json` for scripts.

The check asks `api.github.com` for this repository's `latest` release and compares its
commit with the one your build was made from. It sends no identifiers. Then download and
install the new build the same way as above.

## Privacy and network

ZCode Beyond only connects where you point it: your model providers, web pages the agent
fetches for you, MCP servers you configure, and `api.github.com` when you ask for an update
check. Connections to China-operated services are blocked in every process before DNS
resolution. Vendor login, telemetry, remote configuration and auto-update are switched off
at build time. Details: [`specs/self-hosted-build/`](specs/self-hosted-build/).

## Build from source

Install Git, Node.js **24.14.0** and pnpm **10.33.2** ([mise.toml](mise.toml) is the
source of truth), then from the repository root:

```bash
pnpm bootstrap                      # dependencies, local runtime assets, bootstrap build
pnpm dev:desktop                    # desktop app with source watchers
pnpm --filter @zcode/cli... build   # CLI and its workspace dependencies
node apps/zcode-cli/packages/cli/dist/zcode.cjs --help
```

<details>
<summary>More development commands</summary>

| Command                                        | Purpose                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm dev:desktop:test`                        | Desktop app against the test configuration                                                 |
| `pnpm dev:web`                                 | Web client (`http://localhost:5173`) and backend (`http://localhost:3030`)                 |
| `pnpm --filter @zcode/cli dev`                 | Run the CLI from source                                                                    |
| `pnpm bundle:desktop -- --os mac --arch arm64` | Package the desktop app into `packages/desktop/dist/` (`mac`/`win`/`linux`, `x64`/`arm64`) |
| `pnpm build:zcode`                             | Node.js CLI distribution with `zcode --web`, written to `dist/zcode/`                      |
| `pnpm typecheck`, `pnpm lint`                  | Checks run by CI                                                                           |
| `pnpm architecture:check --changed`            | Architecture policy check                                                                  |

- `ZCODE_DATA_BASE_DIR="$HOME/.zcode-dev-home"` keeps development data apart from your
  real `~/.zcode`.
- `ZCODE_SERVER_WORKSPACE=/path/to/project pnpm dev:web` sets the Web backend's workspace.
- `ZCODE_BUILTIN_PROVIDER_CONFIG_FILE` replaces the bundled provider configuration
  ([config/README.md](config/README.md)).
- `zcode --web` serves the browser UI on `127.0.0.1` without a token; with
  `--host 0.0.0.0` it generates an access token (`--token`, `--no-token` to override).
- Third-party notices: [third-party/README.md](third-party/README.md).
- Contributor and agent rules: [AGENTS.md](AGENTS.md); design specs: [`specs/`](specs/).

</details>

### Repository structure

| Directory                                            | Responsibility                                              |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| `packages/desktop`                                   | Electron main, host, renderer and desktop packaging         |
| `packages/web`, `packages/server`                    | Web client; HTTP / WebSocket services                       |
| `packages/ui`                                        | Shared React components, hooks and Zustand state            |
| `packages/services`                                  | Business services and persistence                           |
| `packages/shared`, `packages/rpc`, `packages/client` | Shared protocols and types, RPC framework, agent client SDK |
| `apps/zcode-cli`                                     | Agent CLI, terminal UI, runtime and tools                   |
| `.github`, `site`                                    | CI, release builds and the download page                    |

## Releases and CI

GitHub Actions builds everything ([`specs/self-hosted-build/ci-release.md`](specs/self-hosted-build/ci-release.md)):

- **Push to `main`:** one Release run that type-checks, lints and tests, builds the desktop
  app for macOS (arm64, x64), Windows and Linux plus the CLI for six platforms, and
  replaces the rolling [`latest`](https://github.com/cguldogan/zcode-beyond/releases/tag/latest)
  prerelease. Nothing is published if the checks fail.
- **Tag `vX.Y.Z`:** a normal versioned release with generated notes
  (`git tag v1.0.0 && git push origin v1.0.0`).
- **Branches and pull requests:** checks only.
- **Download page:** `site/` is deployed to GitHub Pages when it changes.

Only macOS Apple silicon is required per build; other platforms are best-effort and are
missing from a release when their build failed.

## Upstream

ZCode Beyond keeps the `zcode` command, the `~/.zcode` folder and the `@zcode/*` package
names so that upstream releases can be reviewed and merged (`git remote upstream` →
`zai-org/ZCode`, push disabled). Last upstream sync: ZCode v3.14.3 (2026-09-23).

## License

Apache License 2.0 — see [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md). "ZCode" is the
name of the original product by its authors.

# ZCode Beyond

<div align="center">
  <img src="public/logo/icons/1024x1024.png" alt="ZCode Beyond" width="128" height="128" />
</div>

ZCode Beyond is an AI coding workspace (desktop app and terminal `zcode` CLI) for
**local LLMs only**. It is a modified, independent derivative of
[ZCode](https://github.com/zai-org/ZCode) (`zai-org`), licensed under Apache-2.0,
and is not affiliated with or endorsed by the ZCode authors. See [NOTICE.md](NOTICE.md).

## How it differs from ZCode

- **Local models first:** a LiteLLM provider preset (`http://localhost:4000/v1`)
  with "Load models" discovery from any OpenAI-compatible server.
- **No vendor accounts:** Z.ai/BigModel login, coding plans and their providers are
  removed; `zcode login`/`logout` are disabled.
- **No China egress:** every process blocks connections to China-operated services
  (the vendor, Alibaba Cloud, Tencent, ByteDance Lark, Chinese model APIs, any `.cn`
  host) before DNS.
- **No telemetry, no remote control:** Alibaba ARMS and analytics reporting are off at
  build time; no auto-update, forced update or remote provider configuration.
- **Manual update check from GitHub:** *Check for Updates…* (desktop) and `zcode update`
  (CLI) ask this repository's `latest` release whether a newer build exists and link to
  the download. Only on request, report only: nothing is downloaded or installed.
- **TUI extras:** `/review` panel for uncommitted changes, `/undo` / `/redo` of the last
  agent turn's file edits, `tui.diffStyle` (`auto` | `stacked`), status line with tokens/s,
  `/exit`, real context window, and hold-to-delete-faster (Backspace held 3 s deletes by word).

Design notes live in [`specs/`](specs/). Upstream releases are reviewed before being
merged (`git remote upstream` → `zai-org/ZCode`, push disabled).

| Interface                    | Purpose                                                                                   | Development command            |
| ---------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------ |
| Desktop                      | Electron desktop application                                                              | `pnpm dev:desktop`             |
| Web / ZCode CLI distribution | Terminal and browser workspace; packages the TUI, Web client, backend, and Agent together | `pnpm dev:web`                 |
| Agent CLI                    | The `zcode` terminal interface, which also provides the Agent runtime for Desktop and Web | `pnpm --filter @zcode/cli dev` |

## Downloads & CI

Unsigned builds are published on the [Releases](../../releases) page and on the project's
GitHub Pages download site (`https://<owner>.github.io/<repo>/`). Stable links, with
`<owner>/<repo>` being this repository:

| Build                         | Link                                                                |
| ----------------------------- | ------------------------------------------------------------------- |
| Newest `main` build (rolling) | `https://github.com/<owner>/<repo>/releases/download/latest/<file>` |
| A versioned release           | `https://github.com/<owner>/<repo>/releases/download/vX.Y.Z/<file>` |
| Newest versioned release      | `https://github.com/<owner>/<repo>/releases/latest/download/<file>` |

`<file>` is one of `ZCode-Beyond-mac-arm64.dmg` / `.zip`, `ZCode-Beyond-mac-x64.dmg` / `.zip`,
`ZCode-Beyond-win-x64-setup.exe`, `ZCode-Beyond-linux-x64.AppImage` / `.deb` / `.rpm` /
`.pkg.tar.zst`, `zcode-beyond-cli-<mac|linux>-<x64|arm64>.tar.gz`,
`zcode-beyond-cli-win-<x64|arm64>.zip` (single-executable CLI, no Node.js needed),
`zcode-beyond-cli-node.tar.gz` (CLI + `zcode --web`, needs Node.js 24), each with a
`.sha256`, plus `SHA256SUMS.txt`. Only macOS arm64 is guaranteed per build; other
platforms are best-effort and are missing from a release when their build failed.

How releases are made (GitHub Actions, details in
[`specs/self-hosted-build/ci-release.md`](specs/self-hosted-build/ci-release.md)):

- `ci.yml`: typecheck, lint, architecture check, CLI typecheck and tests on branches and pull requests.
- `release.yml`: a push to `main` runs the same checks (as its `Checks` job), rebuilds everything and updates the rolling `latest`
  prerelease in place; pushing a tag `vX.Y.Z` (`git tag v1.0.0 && git push origin v1.0.0`)
  creates a normal release with generated notes. Manual runs build only unless "publish" is ticked.
- `pages.yml`: deploys `site/` when it, the logo or `package.json` changes on `main`.

One-time setup for the repository owner:

1. **Actions tab** → enable workflows (GitHub disables them on forks until you do).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**, then run the
   **Pages** workflow once (Actions → Pages → Run workflow).
3. Optional: **Settings → Actions → General → Workflow permissions** can stay on
   "Read repository contents"; each job requests the write scopes it needs. If an
   organization policy forbids raising them, choose "Read and write permissions".
4. After renaming the repository, run the Pages workflow again so the site links use the new name.

## Updates

- 2026-9-23: Updated to ZCode v3.14.3.

## Setup

Install Git, Node.js **24.14.0**, and pnpm **10.33.2**. [mise.toml](mise.toml) is the source of truth for tool versions. Run all development and packaging commands below from the repository root.

```bash
pnpm bootstrap
```

`pnpm bootstrap` installs workspace dependencies, prepares local desktop runtime assets, and runs `build:bootstrap`.

The Agent CLI and runtime source code lives in [apps/zcode-cli/](apps/zcode-cli/) as a regular directory included when you clone this repository. No separate checkout or Git submodule initialization is required.

Additional setup and build commands:

| Command                        | Purpose                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                 | Install dependencies                                                                                                                |
| `pnpm prepare:desktop-runtime` | Prepare desktop runtime assets, including remote assets by default                                                                  |
| `pnpm prepare:remote-assets`   | Prepare remote runtime assets separately                                                                                            |
| `pnpm bootstrap:with-remote`   | Set up dependencies and local and remote assets, then build the relevant packages sequentially; skip the desktop application bundle |
| `pnpm build`                   | Recursively run each workspace package's build script, including its asset preparation steps                                        |

The default `bootstrap` skips remote asset preparation and is suitable for local desktop development. Run the corresponding preparation command when working with remote workspaces or validating remote distribution assets.

## Development and Usage

### Desktop

```bash
pnpm dev:desktop

# Use the test environment
pnpm dev:desktop:test
```

`pnpm dev:desktop` defaults to `pnpm dev:desktop:prod` and uses production service configuration. The startup script prepares local runtime assets, builds the desktop Agent, then starts Electron and source watchers.

Set `ZCODE_DATA_BASE_DIR` to use a separate development data directory. For example, on macOS / Linux:

```bash
ZCODE_DATA_BASE_DIR="$HOME/.zcode-dev-home" pnpm dev:desktop:test
```

### Remote features (SSH/WSL)

Run `pnpm bootstrap:with-remote` first to prepare remote assets (mock-cdn), then `pnpm dev:desktop`. When connecting to a remote project, choose "download locally and upload" for asset delivery. In development, assets come from the local `packages/desktop/mock-cdn` and local build outputs, are uploaded to the remote host over SFTP, and never touch a CDN.

### Web Development

Use development mode when editing Web or backend source code:

```bash
pnpm dev:web

# Set the backend workspace (macOS / Linux)
ZCODE_SERVER_WORKSPACE=/path/to/project pnpm dev:web
```

This starts both the Web development server (default: `http://localhost:5173`) and the backend (default: `http://localhost:3030`). Open the Web development server in your browser. `/ws` and general `/api` requests are proxied to the local backend; `/api/v1/oauth/token` is proxied separately to the configured product service.

After changing Agent source code, run `pnpm --filter @zcode/cli... build` and restart the service. To validate the complete distribution, extract and run it as described under Packaging → ZCode CLI distribution below.

### ZCode CLI distribution

The command-line distribution includes the TUI, Web client, and Agent behind one `zcode` command. With no arguments it starts the TUI; a leading `--web` starts Web mode; all other arguments go to the existing Agent CLI. Both modes run locally without Electron.

```bash
# Start the terminal UI by default
zcode

# Start the Web interface
zcode --web

# Set the project and port without opening a browser automatically
zcode --web --workspace /path/to/project --port 3030 --no-open

# Show CLI or Web options
zcode --help
zcode --web --help
```

In Web mode, it uses the current directory as the workspace, listens on `127.0.0.1` without token authentication by default, selects an available port, and opens a browser. Use the URL printed in the terminal and press `Ctrl+C` to stop the service. For LAN access, use `--host 0.0.0.0`; listening on a non-local address generates an access token by default. Use the token-bearing URL printed in the terminal. Set a token with `--token`, or disable token authentication with `--no-token`.

When starting the general Web service's HTTP entry directly, configure API/WebSocket authentication with `ZCODE_SERVER_AUTH_TOKEN`. When creating the service programmatically, use the `authToken` option.

See Packaging below for build instructions. `pnpm build:zcode` only creates the distribution; it does not replace an existing `zcode` on `PATH`. If the command still points to an older installation or another checkout, check it with `command -v zcode` on macOS / Linux or `where.exe zcode` on Windows.

### CLI Source Development

Use the source entry when developing the TUI or Agent:

```bash
pnpm --filter @zcode/cli dev --help
pnpm --filter @zcode/cli dev

# Build the CLI and its workspace dependencies
pnpm --filter @zcode/cli... build
node apps/zcode-cli/packages/cli/dist/zcode.cjs --help
```

This entry runs the Agent CLI directly and does not handle the distribution's `--web` switch. Use `pnpm dev:web` for Web development, or the extracted `bin/zcode.mjs` shown below to test the unified command.

## Configuration

The root [.env.example](.env.example) provides sample service URLs and build configuration. Copy it to `.env` as needed and place local overrides in `.env.local`. Select the Desktop development environment with `dev:desktop:test` or `dev:desktop:prod`.

| Setting                              | Purpose                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| `ZCODE_DATA_BASE_DIR`                | Base directory for application data, stored under its `.zcode/` subdirectory            |
| `ZCODE_SERVER_WORKSPACE`             | Workspace path for the Web backend                                                      |
| `ZCODE_BUILTIN_PROVIDER_CONFIG_FILE` | Path to a local provider configuration file; uses the built-in configuration when unset |
| `ZCODE_DIST_BASE_URL`                | Download base URL used by the CLI distribution installer                                |

Runtime variables can be set explicitly in the environment of the startup command. See [config/README.md](config/README.md) for the default configuration shipped with the client.

## Packaging

See [third-party/README.md](third-party/README.md) for notice generation, distribution checks, and where the notices are included in each distribution.

### Desktop

```bash
pnpm bundle:desktop

# Set the target platform and CPU architecture
pnpm bundle:desktop -- --os win --arch x64

pnpm bundle:desktop -- --help
```

The default target is macOS arm64, and the default output directory is `packages/desktop/dist/`. `--os` accepts `mac`, `win`, or `linux`; `--arch` accepts `x64` or `arm64`. Packaging and signing require the tools and configuration for the target platform.

Install: open the DMG and drag ZCode Beyond into "Applications". Local builds are unsigned; if macOS blocks the first launch, run:

```bash
sudo xattr -rd com.apple.quarantine "/Applications/ZCode Beyond.app"
```

### ZCode CLI distribution

Run `pnpm build:zcode` to build the CLI/TUI, backend, and Web client, collect the TUI native libraries, workers, and runtime dependencies, then assemble the distribution. Running the distribution still requires Node.js; use the version specified in `mise.toml`.

Before packaging, set the download base URL with `ZCODE_DIST_BASE_URL` in `.env`, `.env.local`, or the process environment, or pass it through `--base-url`. The URL below is a placeholder; replace it with your hosting URL when publishing:

```bash
pnpm build:zcode --base-url https://downloads.example.com/zcode/

# When ZCODE_DIST_BASE_URL is already configured
pnpm build:zcode

# Repackage existing Agent, backend, and Web build outputs
pnpm build:zcode --skip-build

# Show options for the version, output directory, and more
pnpm build:zcode --help
```

The version defaults to the root `package.json` version. Output is written to `dist/zcode/`:

- `releases/<version>/zcode-<version>.tar.gz`: runtime package.
- `releases/<version>/sha256.txt`: checksum file.
- `latest.json` and `install.sh`: version index and installer.

Upload the entire directory to the configured download base URL. The installer downloads the runtime package from that URL, installs it to `~/.zcode/runtime` by default, and creates the `zcode` command in `~/.local/bin`. Override these directories with `ZCODE_DIST_HOME` and `ZCODE_DIST_BIN_DIR`, respectively.

Existing Lite users should switch to the new build command, environment variables, and installer. Installation does not remove old Lite directories or migrate/delete session data.

To test a packaged build locally, extract and run it directly without uploading or installing it:

```bash
zcode_version=$(node -p "require('./dist/zcode/latest.json').version")
mkdir -p dist/zcode/debug
tar -xzf "dist/zcode/releases/$zcode_version/zcode-$zcode_version.tar.gz" \
  -C dist/zcode/debug
# Start the TUI by default
node dist/zcode/debug/zcode/bin/zcode.mjs

# Start Web mode
node dist/zcode/debug/zcode/bin/zcode.mjs --web \
  --workspace "$PWD" --port 3030 --no-open
```

Open `http://127.0.0.1:3030` to validate the complete flow, with one backend serving the Web pages and running the Agent. The port must be available; if `pnpm dev:web` is already running, choose another `--port`.

## Repository Structure

| Directory                                            | Responsibility                                                                          |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `packages/desktop`                                   | Electron Main, Host, Renderer, and desktop packaging                                    |
| `packages/web`                                       | Web client                                                                              |
| `packages/server`                                    | HTTP / WebSocket services and remote connections                                        |
| `packages/zcode-server-cli`                          | Standalone server startup and process management                                        |
| `packages/ui`                                        | Shared React components, hooks, and Zustand state                                       |
| `packages/services`                                  | Business services and persistence                                                       |
| `packages/shared`, `packages/rpc`, `packages/client` | Shared protocols and types, RPC framework, and Agent client SDK                         |
| `packages/provider`, `packages/provider-node`        | Common provider capabilities and Node implementations                                   |
| `apps/zcode-cli`                                     | Agent CLI, TUI, runtime, and tools                                                      |
| `scripts`, `config`, `third-party`                   | Build and maintenance scripts, built-in configuration, and third-party notice materials |

## Project Notice

See [NOTICE.md](NOTICE.md) for feature and promotion scope, maintenance policy, execution and data risks, licensing, and third-party copyright information.

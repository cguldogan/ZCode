# ZCode Beyond branding

Status: accepted · Scope: desktop, CLI/TUI, web · Owner: `PRODUCT_DISPLAY_NAME`

ZCode Beyond is a separate, local-LLM-only project derived from ZCode
(`zai-org/ZCode`, Apache-2.0). Branding changes identity points only, so that
upstream releases can still be reviewed and merged (`git remote upstream`,
push disabled).

## Rules

- Single owner: `PRODUCT_DISPLAY_NAME = "ZCode Beyond"`
  (`packages/shared/src/branding.ts`). TypeScript call sites import it; the
  desktop build identity (`packages/desktop/scripts/desktop-product-identity.mjs`,
  plain build-time JS) mirrors it and a test keeps them equal.
- Desktop identity: product name `ZCode Beyond` (Preview: `ZCode Beyond Preview`,
  dev: `ZCode Beyond Dev`), bundle id `io.github.cguldogan.zcodebeyond`
  (`.preview`, `.development`, `.finder-open-workflow`), Linux package
  `zcode-beyond`. The app therefore has its own settings folder and never
  shares a single-instance lock or bundle id with an official ZCode install.
- Visible identity: window and tray titles, About box, sidebar footer, logo
  labels, TUI sidebar title, CLI help header, web page titles.
- Outbound identity: the web-fetch User-Agent and the OpenRouter attribution
  header name ZCode Beyond and its repository, not the vendor's site.
- Unchanged on purpose: the `zcode` command, the `~/.zcode` data folder,
  `@zcode/*` package names, protocol identifiers, and body copy in the UI
  string tables (about 100 strings per language that mention ZCode). Renaming
  those would conflict with nearly every upstream merge.
- Legal: `LICENSE` and the upstream `NOTICE.md` are kept; the README states
  the project is a modified derivative and is not affiliated with Zhipu AI.

## Acceptance

`zcode --help` starts with "ZCode Beyond"; the packaged desktop app is
`ZCode Beyond.app` with bundle id `io.github.cguldogan.zcodebeyond`; About
shows "About ZCode Beyond"; the policy test fails if the build identity and
`PRODUCT_DISPLAY_NAME` drift apart.

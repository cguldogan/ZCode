#!/usr/bin/env bash
# Publish release assets with the GitHub CLI (preinstalled on GitHub runners).
#
# Usage:
#   publish-release.sh rolling   <asset-dir>        # tag "latest", prerelease, moved to GITHUB_SHA
#   publish-release.sh versioned <tag> <asset-dir>  # e.g. v1.2.3; '-' in the tag => prerelease
#
# Environment: GH_TOKEN (GITHUB_TOKEN with contents: write), GH_REPO (owner/name),
# GITHUB_SHA, optional APP_VERSION and GITHUB_SERVER_URL.
#
# Link scheme (specs/self-hosted-build/ci-release.md):
#   rolling:   https://github.com/<repo>/releases/download/latest/<stable-name>
#   versioned: https://github.com/<repo>/releases/download/<tag>/<stable-name>
#              https://github.com/<repo>/releases/latest/download/<stable-name>
#              (GitHub resolves /releases/latest to the newest non-prerelease, so the
#              rolling "latest" prerelease never shadows a versioned release.)
set -euo pipefail

: "${GH_REPO:?GH_REPO is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
server="${GITHUB_SERVER_URL:-https://github.com}"
mode="${1:-}"

collect_assets() {
  local dir="$1"
  shopt -s nullglob
  assets=("$dir"/*)
  if [ "${#assets[@]}" -eq 0 ]; then
    echo "no assets in $dir" >&2
    exit 1
  fi
}

write_install_notes() {
  cat <<'EOF'
### Install notes

- **Unsigned builds.** macOS: right-click the app → Open, or run
  `xattr -dr com.apple.quarantine "/Applications/ZCode Beyond.app"`.
  Windows: SmartScreen → More info → Run anyway. Linux AppImage: `chmod +x` first.
- **CLI:** `zcode-beyond-cli-<os>-<arch>` archives hold a single `zcode` executable (no Node.js
  needed). `zcode-beyond-cli-node.tar.gz` adds `zcode --web` and needs Node.js 24.
- **Verify downloads:** `shasum -a 256 -c <file>.sha256` or compare with `SHA256SUMS.txt`.
EOF
}

publish_rolling() {
  local dir="$1"
  local tag="latest"
  local short="${GITHUB_SHA:0:8}"
  local title="Rolling build (main @ $short)"
  local notes
  notes="$(mktemp)"
  collect_assets "$dir"

  {
    echo "Automated build of \`main\` at ${server}/${GH_REPO}/commit/${GITHUB_SHA}."
    echo
    echo "This prerelease is replaced on every push to \`main\`; it is not a versioned release."
    [ -n "${APP_VERSION:-}" ] && echo "App version: ${APP_VERSION}."
    echo
    echo "Stable links: \`${server}/${GH_REPO}/releases/download/${tag}/<file>\`."
    echo
    write_install_notes
    echo
    # Machine-readable build marker for the in-app update check; hidden when rendered.
    # Format owned by packages/shared/src/githubBuildUpdate.ts (formatGitHubBuildMarker).
    if [ -n "${APP_VERSION:-}" ]; then
      printf '<!-- zcode-beyond-build {"commit":"%s","version":"%s"} -->\n' "$GITHUB_SHA" "$APP_VERSION"
    else
      printf '<!-- zcode-beyond-build {"commit":"%s"} -->\n' "$GITHUB_SHA"
    fi
  } >"$notes"

  # 1. Point the tag at this commit first, so a newly created release can never
  #    attach to a stale tag left behind by an earlier, deleted release.
  if gh api "repos/${GH_REPO}/git/ref/tags/${tag}" >/dev/null 2>&1; then
    gh api -X PATCH "repos/${GH_REPO}/git/refs/tags/${tag}" \
      -f sha="$GITHUB_SHA" -F force=true >/dev/null
  else
    gh api -X POST "repos/${GH_REPO}/git/refs" \
      -f ref="refs/tags/${tag}" -f sha="$GITHUB_SHA" >/dev/null
  fi

  # 2. Create or update the release in place. Updating (instead of delete +
  #    recreate) keeps every download link working except for the few seconds
  #    an individual asset is being replaced.
  if gh release view "$tag" >/dev/null 2>&1; then
    local wanted=" " asset name
    for asset in "${assets[@]}"; do wanted+="$(basename "$asset") "; done
    # Drop assets a previous build published but this one did not produce
    # (e.g. a best-effort platform that failed), so no stale binary lingers.
    while IFS= read -r name; do
      [ -z "$name" ] && continue
      case "$wanted" in
        *" $name "*) ;;
        *) gh release delete-asset "$tag" "$name" --yes ;;
      esac
    done < <(gh release view "$tag" --json assets --jq '.assets[].name')
    gh release upload "$tag" "${assets[@]}" --clobber
    # 3. Notes (and the build marker the update check reads) go last, so the marker only
    #    names a commit once all of its files are uploaded (github-update-check.md §3).
    gh release edit "$tag" --prerelease --title "$title" --notes-file "$notes"
  else
    # gh uploads assets to a draft and publishes it afterwards, so the marker never
    # becomes visible before the files.
    gh release create "$tag" "${assets[@]}" --prerelease --title "$title" --notes-file "$notes"
  fi
  rm -f "$notes"
}

publish_versioned() {
  local tag="$1" dir="$2"
  local notes
  notes="$(mktemp)"
  collect_assets "$dir"
  local base="${server}/${GH_REPO}/releases/download/${tag}"

  {
    echo "## Downloads"
    echo
    echo "| Platform | File |"
    echo "| --- | --- |"
    local asset name prefix
    # Desktop installers first, then CLI packages.
    for prefix in ZCode-Beyond- zcode-beyond-; do
      for asset in "${assets[@]}"; do
        name="$(basename "$asset")"
        case "$name" in *.sha256 | SHA256SUMS.txt) continue ;; esac
        case "$name" in "$prefix"*) ;; *) continue ;; esac
        echo "| $(describe_asset "$name") | [${name}](${base}/${name}) |"
      done
    done
    echo
    write_install_notes
    echo
  } >"$notes"

  local prerelease=()
  case "$tag" in *-*) prerelease=(--prerelease) ;; esac

  if gh release view "$tag" >/dev/null 2>&1; then
    # Re-run of the same tag: refresh assets, keep the notes the owner may have edited.
    gh release upload "$tag" "${assets[@]}" --clobber
  else
    gh release create "$tag" "${assets[@]}" --verify-tag ${prerelease[@]+"${prerelease[@]}"} \
      --title "ZCode Beyond ${tag}" --notes-file "$notes" --generate-notes
  fi
  rm -f "$notes"
}

describe_asset() {
  case "$1" in
    ZCode-Beyond-mac-arm64.dmg) echo "macOS Apple silicon (DMG)" ;;
    ZCode-Beyond-mac-arm64.zip) echo "macOS Apple silicon (ZIP)" ;;
    ZCode-Beyond-mac-x64.dmg) echo "macOS Intel (DMG)" ;;
    ZCode-Beyond-mac-x64.zip) echo "macOS Intel (ZIP)" ;;
    ZCode-Beyond-win-*-setup.exe) echo "Windows installer" ;;
    ZCode-Beyond-linux-*.AppImage) echo "Linux AppImage" ;;
    ZCode-Beyond-linux-*.deb) echo "Linux .deb (Debian/Ubuntu)" ;;
    ZCode-Beyond-linux-*.rpm) echo "Linux .rpm (Fedora/RHEL)" ;;
    ZCode-Beyond-linux-*.pkg.tar.zst) echo "Linux pacman (Arch)" ;;
    zcode-beyond-cli-node.tar.gz) echo "CLI + web UI (needs Node.js 24)" ;;
    zcode-beyond-cli-*) echo "CLI single executable" ;;
    *) echo "Other" ;;
  esac
}

case "$mode" in
  rolling)
    [ "$#" -eq 2 ] || { echo "usage: $0 rolling <asset-dir>" >&2; exit 2; }
    publish_rolling "$2"
    ;;
  versioned)
    [ "$#" -eq 3 ] || { echo "usage: $0 versioned <tag> <asset-dir>" >&2; exit 2; }
    publish_versioned "$2" "$3"
    ;;
  *)
    echo "usage: $0 <rolling|versioned> ..." >&2
    exit 2
    ;;
esac

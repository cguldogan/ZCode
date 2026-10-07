#!/usr/bin/env bash
# Package the CLI builds under stable, space-free release names.
#
# Usage:
#   package-cli.sh sea  <cli-dist-dir> <out-dir> <repo-root>
#   package-cli.sh node <tarball>      <out-dir>
#
# sea:  every single-executable binary that build-sea.mjs wrote
#       (zcode-<darwin|linux|windows>-<arch>[.exe]) becomes
#       zcode-beyond-cli-<mac|linux|win>-<arch>.tar.gz (.zip for Windows), holding
#       one folder with the binary renamed to `zcode`/`zcode.exe` plus the license
#       and notice files. Prints the packaged target names, one per line, on stdout.
# node: the platform-neutral `pnpm build:zcode` tarball (needs Node.js 24 to run)
#       becomes zcode-beyond-cli-node.tar.gz.
# Each output gets a .sha256 file.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$script_dir/lib.sh"

mode="${1:-}"

package_sea() {
  local dist="$1" out="$2" repo_root="$3"
  local stage binary file platform arch exe release_platform name dir
  mkdir -p "$out"
  out="$(cd "$out" && pwd)"
  stage="$(mktemp -d)"
  shopt -s nullglob

  for binary in "$dist"/zcode-darwin-* "$dist"/zcode-linux-* "$dist"/zcode-windows-*; do
    file="$(basename "$binary")"
    # Skip intermediates such as zcode-linux-x64.sea.blob.
    case "$file" in *.blob | *.json) continue ;; esac
    if [[ ! "$file" =~ ^zcode-(darwin|linux|windows)-(x64|arm64)(\.exe)?$ ]]; then
      continue
    fi
    platform="${BASH_REMATCH[1]}"
    arch="${BASH_REMATCH[2]}"
    exe="${BASH_REMATCH[3]}"
    case "$platform" in
      darwin) release_platform=mac ;;
      windows) release_platform=win ;;
      *) release_platform="$platform" ;;
    esac
    name="zcode-beyond-cli-$release_platform-$arch"
    dir="$stage/$name"
    mkdir -p "$dir"
    cp "$binary" "$dir/zcode$exe"
    chmod 755 "$dir/zcode$exe"
    cp "$repo_root/LICENSE" "$dir/LICENSE"
    cp "$repo_root/NOTICE.md" "$dir/NOTICE.md"
    [ -f "$dist/THIRD-PARTY-NOTICES.md" ] && cp "$dist/THIRD-PARTY-NOTICES.md" "$dir/"
    [ -f "$dist/LICENSE.node.txt" ] && cp "$dist/LICENSE.node.txt" "$dir/"

    if [ "$release_platform" = win ]; then
      (cd "$stage" && zip -qr "$out/$name.zip" "$name")
      write_sha256_file "$out/$name.zip"
    else
      # COPYFILE_DISABLE keeps macOS tar from adding AppleDouble (._*) entries.
      (cd "$stage" && COPYFILE_DISABLE=1 tar -czf "$out/$name.tar.gz" "$name")
      write_sha256_file "$out/$name.tar.gz"
    fi
    echo "$release_platform-$arch"
  done
  rm -rf "$stage"
}

package_node() {
  local tarball="$1" out="$2"
  local name="zcode-beyond-cli-node.tar.gz"
  if [ ! -f "$tarball" ]; then
    echo "missing Node distribution tarball: $tarball" >&2
    return 1
  fi
  mkdir -p "$out"
  cp "$tarball" "$out/$name"
  write_sha256_file "$out/$name"
  echo "node"
}

case "$mode" in
  sea)
    [ "$#" -eq 4 ] || { echo "usage: $0 sea <cli-dist-dir> <out-dir> <repo-root>" >&2; exit 2; }
    package_sea "$2" "$3" "$4"
    ;;
  node)
    [ "$#" -eq 3 ] || { echo "usage: $0 node <tarball> <out-dir>" >&2; exit 2; }
    package_node "$2" "$3"
    ;;
  *)
    echo "usage: $0 <sea|node> ..." >&2
    exit 2
    ;;
esac

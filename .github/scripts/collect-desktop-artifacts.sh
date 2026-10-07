#!/usr/bin/env bash
# Copy electron-builder output to stable, space-free release names and write
# a .sha256 next to each file.
#
# Usage: collect-desktop-artifacts.sh <mac|win|linux> <x64|arm64> <dist-dir> <out-dir>
#
# electron-builder names files "${productName}-${version}-<platform>-${arch}.<ext>"
# (packages/desktop/electron-builder.config.js), e.g. "ZCode Beyond-3.14.3-mac-arm64.dmg".
# The arch token differs per Linux target (x86_64 for AppImage/rpm, amd64 for deb),
# so files are matched by "-<platform>-" and extension; each job builds one arch.
# Required formats fail the script when missing; optional ones are skipped.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$script_dir/lib.sh"

if [ "$#" -ne 4 ]; then
  echo "usage: $0 <mac|win|linux> <x64|arm64> <dist-dir> <out-dir>" >&2
  exit 2
fi

os="$1"
arch="$2"
src="$3"
out="$4"
base="ZCode-Beyond"

case "$arch" in
  x64 | arm64) ;;
  *) echo "unsupported arch: $arch" >&2; exit 2 ;;
esac

# Each entry: "<source extension>|<stable name>|required|optional"
case "$os" in
  mac)
    entries=(
      ".dmg|$base-mac-$arch.dmg|required"
      ".zip|$base-mac-$arch.zip|required"
    )
    ;;
  win)
    entries=(
      ".exe|$base-win-$arch-setup.exe|required"
    )
    ;;
  linux)
    entries=(
      ".AppImage|$base-linux-$arch.AppImage|required"
      ".deb|$base-linux-$arch.deb|required"
      ".rpm|$base-linux-$arch.rpm|optional"
      ".pkg.tar.zst|$base-linux-$arch.pkg.tar.zst|optional"
    )
    ;;
  *)
    echo "unsupported os: $os" >&2
    exit 2
    ;;
esac

mkdir -p "$out"
shopt -s nullglob
status=0

for entry in "${entries[@]}"; do
  IFS='|' read -r ext stable_name requirement <<<"$entry"
  # "*-<os>-*<ext>" skips helpers such as "__uninstaller-nsis-*.exe" and
  # never matches "*.blockmap" or latest*.yml.
  matches=("$src"/*-"$os"-*"$ext")
  if [ "${#matches[@]}" -eq 0 ]; then
    if [ "$requirement" = required ]; then
      echo "::error::no $ext artifact for $os/$arch in $src"
      status=1
    else
      echo "::notice::optional $ext artifact for $os/$arch not produced; skipping"
    fi
    continue
  fi
  if [ "${#matches[@]}" -gt 1 ]; then
    echo "::error::expected one $ext artifact for $os/$arch, found ${#matches[@]}: ${matches[*]}"
    status=1
    continue
  fi
  cp "${matches[0]}" "$out/$stable_name"
  write_sha256_file "$out/$stable_name"
  echo "collected '${matches[0]}' -> $out/$stable_name"
done

exit "$status"

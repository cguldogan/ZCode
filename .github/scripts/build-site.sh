#!/usr/bin/env bash
# Build the static download site into <out-dir>.
#
# Usage: build-site.sh <repo-root> <out-dir> <owner/repo>
#
# Replaces __REPO__ with the repository slug (so a repository rename only needs
# a re-deploy) and __APP_VERSION__ with the root package.json version, then
# copies the logo. Fails if a placeholder survives.
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: $0 <repo-root> <out-dir> <owner/repo>" >&2
  exit 2
fi

root="$1"
out="$2"
slug="$3"

# GitHub owner and repository names: letters, digits, '-', '_' and '.'.
# Validating here also keeps the sed replacement below free of metacharacters.
if [[ ! "$slug" =~ ^[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9._-]+$ ]]; then
  echo "invalid repository slug: '$slug'" >&2
  exit 1
fi

version="$(node -p "require(process.argv[1]).version" "$root/package.json")"
if [[ ! "$version" =~ ^[0-9A-Za-z.+-]+$ ]]; then
  echo "unexpected package.json version: '$version'" >&2
  exit 1
fi

rm -rf "$out"
mkdir -p "$out"
cp -R "$root/site/." "$out/"
cp "$root/public/logo/icons/256x256.png" "$out/logo.png"
cp "$root/public/logo/icons/32x32.png" "$out/favicon.png"

shopt -s nullglob
for page in "$out"/*.html; do
  sed -e "s|__REPO__|$slug|g" -e "s|__APP_VERSION__|$version|g" "$page" >"$page.tmp"
  mv "$page.tmp" "$page"
done

if grep -n -e '__REPO__' -e '__APP_VERSION__' "$out"/*.html; then
  echo "unreplaced placeholder in site output" >&2
  exit 1
fi

echo "site built in $out for $slug (app version $version)"

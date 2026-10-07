#!/usr/bin/env bash
# Shared helpers for the release scripts. Source it; do not execute it.

# sha256_of <file> -> prints the lowercase hex digest.
# GNU coreutils (Linux, Git Bash on Windows) has sha256sum; macOS has shasum.
sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

# write_sha256_file <file> -> writes "<file>.sha256" in `sha256sum -c` format,
# with the bare file name so the check works next to the download.
write_sha256_file() {
  local file="$1"
  local name
  name="$(basename "$file")"
  printf '%s  %s\n' "$(sha256_of "$file")" "$name" >"$file.sha256"
}

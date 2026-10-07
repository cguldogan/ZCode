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

# Emit the last lines of a log as a GitHub error annotation. Annotations are public, unlike
# job logs, so a failure can be diagnosed without signing in. Usage: annotate_log_tail <log> <title>
annotate_log_tail() {
  local log="$1" title="$2" body
  # sed/awk instead of ${var//…} so this behaves the same on macOS bash 3.2 and bash 5.
  body="$(tail -n 40 "$log" 2>/dev/null | tr -d '\r' | sed 's/%/%25/g' | awk '{ printf "%s%%0A", $0 }')"
  echo "::error title=${title}::${body}"
}

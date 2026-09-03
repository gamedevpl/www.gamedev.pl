#!/bin/sh
# Bundle the gamedevpl Node script for GitHub Releases (cli-v*). No postinstall.
# One asset for every OS — checkout already requires Node 20.
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
version="${1:-$(node -p "require('$root/package.json').version")}"
out="$root/dist/release"
rm -rf "$out"
mkdir -p "$out"
node "$root/scripts/build-binary.mjs"
install -m 0755 "$root/dist/gamedevpl.mjs" "$out/gamedevpl"
(cd "$out" && sha256sum gamedevpl > SHA256SUMS)
echo "cli-v$version artifact in $out"
cat "$out/SHA256SUMS"

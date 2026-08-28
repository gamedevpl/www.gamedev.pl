#!/bin/sh
# Compile gamedev binaries for GitHub Releases (cli-v*). No postinstall.
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
version="${1:-$(node -p "require('$root/package.json').version")}"
out="$root/dist/release"
rm -rf "$out"
mkdir -p "$out"
cd "$root"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required to compile self-contained binaries" >&2
  exit 1
fi

compile() {
  target=$1
  name=$2
  bun build --compile --target="$target" src/main.ts --outfile "$out/$name"
}

compile bun-linux-x64 gamedev-linux-x64
compile bun-linux-arm64 gamedev-linux-arm64
compile bun-darwin-arm64 gamedev-darwin-arm64
compile bun-darwin-x64 gamedev-darwin-x64
compile bun-windows-x64 gamedev-windows-x64.exe

(cd "$out" && sha256sum gamedev-linux-x64 gamedev-linux-arm64 gamedev-darwin-arm64 gamedev-darwin-x64 gamedev-windows-x64.exe > SHA256SUMS)
echo "cli-v$version artifacts in $out"
cat "$out/SHA256SUMS"

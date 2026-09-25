#!/bin/sh
# Bundle the gamedevpl Node script for GitHub Releases (cli-v*). No postinstall.
# One asset for every OS — checkout already requires Node 20.
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
version="${1:-$(node -p "require('$root/package.json').version")}"
out="$root/dist/release"
rm -rf "$out"
mkdir -p "$out"
npm run build --workspace @gamedevpl/contract --prefix "$root/../.."
node "$root/scripts/build-binary.mjs"
install -m 0755 "$root/dist/gamedevpl.mjs" "$out/gamedevpl"
package_dir="$root/dist/npm-package"
mkdir -p "$package_dir/bin"
install -m 0755 "$root/dist/gamedevpl.mjs" "$package_dir/bin/gamedevpl.mjs"
cat > "$package_dir/package.json" <<EOF
{
  "name": "@gamedevpl/cli",
  "version": "$version",
  "private": true,
  "type": "module",
  "bin": {
    "gamedevpl": "./bin/gamedevpl.mjs",
    "git-remote-gamedevpl": "./bin/gamedevpl.mjs"
  },
  "engines": { "node": ">=20.19" }
}
EOF
package_name=$(npm pack "$package_dir" --pack-destination "$out" --ignore-scripts --silent)
mv "$out/$package_name" "$out/gamedevpl-npm.tgz"
(cd "$out" && sha256sum gamedevpl gamedevpl-npm.tgz > SHA256SUMS)
echo "cli-v$version artifact in $out"
cat "$out/SHA256SUMS"

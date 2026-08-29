export const CLI_VERSION = '0.1.0';

export const CLI_RELEASE_PREFIX = 'cli-v';

export const CLI_ASSET = 'gamedevpl';

export function installSh(origin: string): string {
  return `#!/bin/sh
# gamedevpl installer — checksum-verifying Node script into ~/.local/bin
# Review this file. It is the whole install. No postinstall beyond the copy.
set -eu
# Served from ${origin}. The payload is always GitHub Releases, not this origin.
VERSION="\${GAMEDEV_VERSION:-${CLI_VERSION}}"
BIN_DIR="\${GAMEDEV_BIN_DIR:-$HOME/.local/bin}"
if ! command -v node >/dev/null 2>&1; then
  echo "gamedevpl needs Node 20+ (same as a game checkout)" >&2
  exit 1
fi
major=$(node -p "process.versions.node.split('.')[0]")
if [ "$major" -lt 20 ]; then
  echo "Node $(node -v) is too old; need 20+" >&2
  exit 1
fi
asset="${CLI_ASSET}"
base="https://github.com/gamedevpl/www.gamedev.pl/releases/download/${CLI_RELEASE_PREFIX}\${VERSION}"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
echo "fetching $asset from GitHub Releases (cli-v$VERSION)"
curl -fsSL "$base/$asset" -o "$tmp/$asset"
curl -fsSL "$base/SHA256SUMS" -o "$tmp/SHA256SUMS"
expected=$(grep " $asset$" "$tmp/SHA256SUMS" | cut -d ' ' -f 1)
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$tmp/$asset" | cut -d ' ' -f 1)
elif command -v shasum >/dev/null 2>&1; then
  actual=$(shasum -a 256 "$tmp/$asset" | cut -d ' ' -f 1)
else
  echo "need sha256sum or shasum to verify the download" >&2
  exit 1
fi
if [ "$expected" != "$actual" ]; then
  echo "checksum mismatch for $asset" >&2
  exit 1
fi
mkdir -p "$BIN_DIR"
install -m 0755 "$tmp/$asset" "$BIN_DIR/gamedevpl"
install -m 0755 "$tmp/$asset" "$BIN_DIR/git-remote-gamedev"
echo "installed $BIN_DIR/gamedevpl (Node script; also git-remote-gamedev)"
echo "put $BIN_DIR on PATH if it is not already"
`;
}

export function installPs1(origin: string): string {
  return `# gamedevpl installer for Windows — checksum-verifying Node script into %USERPROFILE%\\.local\\bin
# Review this file. It is the whole install. No postinstall beyond the copy.
$ErrorActionPreference = "Stop"
$origin = if ($env:GAMEDEV_ORIGIN) { $env:GAMEDEV_ORIGIN } else { "${origin}" }
$version = if ($env:GAMEDEV_VERSION) { $env:GAMEDEV_VERSION } else { "${CLI_VERSION}" }
$binDir = if ($env:GAMEDEV_BIN_DIR) { $env:GAMEDEV_BIN_DIR } else { Join-Path $HOME ".local\\bin" }
$asset = "${CLI_ASSET}"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "gamedevpl needs Node 20+ (same as a game checkout)" }
$major = [int]((node -p "process.versions.node.split('.')[0]"))
if ($major -lt 20) { throw "Node $(node -v) is too old; need 20+" }
$base = "https://github.com/gamedevpl/www.gamedev.pl/releases/download/${CLI_RELEASE_PREFIX}$version"
$tmp = New-TemporaryFile | ForEach-Object { Remove-Item $_; New-Item -ItemType Directory -Path $_ }
try {
  $bin = Join-Path $tmp.FullName $asset
  $sums = Join-Path $tmp.FullName "SHA256SUMS"
  Invoke-WebRequest -UseBasicParsing "$base/$asset" -OutFile $bin
  Invoke-WebRequest -UseBasicParsing "$base/SHA256SUMS" -OutFile $sums
  $expected = (Select-String -Path $sums -Pattern $asset).Line.Split(" ")[0].ToLower()
  $actual = (Get-FileHash -Algorithm SHA256 $bin).Hash.ToLower()
  if ($expected -ne $actual) { throw "checksum mismatch for $asset" }
  New-Item -ItemType Directory -Force -Path $binDir | Out-Null
  Copy-Item $bin (Join-Path $binDir "gamedevpl")
  Copy-Item $bin (Join-Path $binDir "git-remote-gamedev")
  @(
    '@echo off',
    'node "%~dp0gamedevpl" %*'
  ) | Set-Content -Path (Join-Path $binDir "gamedevpl.cmd")
  @(
    '@echo off',
    'node "%~dp0git-remote-gamedev" %*'
  ) | Set-Content -Path (Join-Path $binDir "git-remote-gamedev.cmd")
  Write-Host "installed $binDir\\gamedevpl (Node script via $origin)"
} finally {
  Remove-Item -Recurse -Force $tmp
}
`;
}

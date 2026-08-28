export const CLI_VERSION = '0.1.0';

export const CLI_RELEASE_PREFIX = 'cli-v';

export const CLI_ASSET = 'gamedev';

export function installSh(origin: string): string {
  return `#!/bin/sh
# gamedev installer — checksum-verifying Node script into ~/.local/bin
# Review this file. It is the whole install. No postinstall beyond the copy.
set -eu
ORIGIN="\${GAMEDEV_ORIGIN:-${origin}}"
VERSION="\${GAMEDEV_VERSION:-${CLI_VERSION}}"
BIN_DIR="\${GAMEDEV_BIN_DIR:-$HOME/.local/bin}"
if ! command -v node >/dev/null 2>&1; then
  echo "gamedev needs Node 20+ (same as a game checkout)" >&2
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
echo "fetching $asset from cli-v$VERSION (via $ORIGIN)"
curl -fsSL "$base/$asset" -o "$tmp/gamedev"
curl -fsSL "$base/SHA256SUMS" -o "$tmp/SHA256SUMS"
(cd "$tmp" && grep " $asset$" SHA256SUMS | sha256sum -c -)
mkdir -p "$BIN_DIR"
install -m 0755 "$tmp/gamedev" "$BIN_DIR/gamedev"
install -m 0755 "$tmp/gamedev" "$BIN_DIR/git-remote-gamedev"
echo "installed $BIN_DIR/gamedev (Node script; also git-remote-gamedev)"
echo "put $BIN_DIR on PATH if it is not already"
`;
}

export function installPs1(origin: string): string {
  return `# gamedev installer for Windows — checksum-verifying Node script into %USERPROFILE%\\.local\\bin
# Review this file. It is the whole install. No postinstall beyond the copy.
$ErrorActionPreference = "Stop"
$origin = if ($env:GAMEDEV_ORIGIN) { $env:GAMEDEV_ORIGIN } else { "${origin}" }
$version = if ($env:GAMEDEV_VERSION) { $env:GAMEDEV_VERSION } else { "${CLI_VERSION}" }
$binDir = if ($env:GAMEDEV_BIN_DIR) { $env:GAMEDEV_BIN_DIR } else { Join-Path $HOME ".local\\bin" }
$asset = "${CLI_ASSET}"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "gamedev needs Node 20+ (same as a game checkout)" }
$major = [int]((node -p "process.versions.node.split('.')[0]"))
if ($major -lt 20) { throw "Node $(node -v) is too old; need 20+" }
$base = "https://github.com/gamedevpl/www.gamedev.pl/releases/download/${CLI_RELEASE_PREFIX}$version"
$tmp = New-TemporaryFile | ForEach-Object { Remove-Item $_; New-Item -ItemType Directory -Path $_ }
try {
  $bin = Join-Path $tmp.FullName "gamedev"
  $sums = Join-Path $tmp.FullName "SHA256SUMS"
  Invoke-WebRequest -UseBasicParsing "$base/$asset" -OutFile $bin
  Invoke-WebRequest -UseBasicParsing "$base/SHA256SUMS" -OutFile $sums
  $expected = (Select-String -Path $sums -Pattern $asset).Line.Split(" ")[0].ToLower()
  $actual = (Get-FileHash -Algorithm SHA256 $bin).Hash.ToLower()
  if ($expected -ne $actual) { throw "checksum mismatch for $asset" }
  New-Item -ItemType Directory -Force -Path $binDir | Out-Null
  Copy-Item $bin (Join-Path $binDir "gamedev")
  Copy-Item $bin (Join-Path $binDir "git-remote-gamedev")
  @(
    '@echo off',
    'node "%~dp0gamedev" %*'
  ) | Set-Content -Path (Join-Path $binDir "gamedev.cmd")
  @(
    '@echo off',
    'node "%~dp0gamedev" %*'
  ) | Set-Content -Path (Join-Path $binDir "git-remote-gamedev.cmd")
  Write-Host "installed $binDir\\gamedev (Node script via $origin)"
} finally {
  Remove-Item -Recurse -Force $tmp
}
`;
}

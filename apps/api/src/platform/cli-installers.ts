export const CLI_VERSION = '0.1.0';

export const CLI_RELEASE_PREFIX = 'cli-v';

export function installSh(origin: string): string {
  return `#!/bin/sh
# gamedev installer — checksum-verifying, writes ~/.local/bin/gamedev
# Review this file. It is the whole install. No postinstall beyond the copy.
set -eu
ORIGIN="\${GAMEDEV_ORIGIN:-${origin}}"
VERSION="\${GAMEDEV_VERSION:-${CLI_VERSION}}"
BIN_DIR="\${GAMEDEV_BIN_DIR:-$HOME/.local/bin}"
os=$(uname -s | tr '[:upper:]' '[:lower:]')
arch=$(uname -m)
case "$os" in
  linux) os=linux ;;
  darwin) os=darwin ;;
  *) echo "unsupported os: $os" >&2; exit 1 ;;
esac
case "$arch" in
  x86_64|amd64) arch=x64 ;;
  arm64|aarch64) arch=arm64 ;;
  *) echo "unsupported arch: $arch" >&2; exit 1 ;;
esac
asset="gamedev-\${os}-\${arch}"
base="https://github.com/gamedevpl/www.gamedev.pl/releases/download/${CLI_RELEASE_PREFIX}\${VERSION}"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
echo "fetching $asset from cli-v$VERSION"
curl -fsSL "$base/$asset" -o "$tmp/gamedev"
curl -fsSL "$base/SHA256SUMS" -o "$tmp/SHA256SUMS"
(cd "$tmp" && grep " $asset$" SHA256SUMS | sha256sum -c -)
mkdir -p "$BIN_DIR"
install -m 0755 "$tmp/gamedev" "$BIN_DIR/gamedev"
install -m 0755 "$tmp/gamedev" "$BIN_DIR/git-remote-gamedev"
echo "installed $BIN_DIR/gamedev (also git-remote-gamedev)"
echo "put $BIN_DIR on PATH if it is not already"
`;
}

export function installPs1(origin: string): string {
  return `# gamedev installer for Windows — checksum-verifying, writes %USERPROFILE%\\.local\\bin
# Review this file. It is the whole install. No postinstall beyond the copy.
$ErrorActionPreference = "Stop"
$origin = if ($env:GAMEDEV_ORIGIN) { $env:GAMEDEV_ORIGIN } else { "${origin}" }
$version = if ($env:GAMEDEV_VERSION) { $env:GAMEDEV_VERSION } else { "${CLI_VERSION}" }
$binDir = if ($env:GAMEDEV_BIN_DIR) { $env:GAMEDEV_BIN_DIR } else { Join-Path $HOME ".local\\bin" }
$asset = "gamedev-windows-x64.exe"
$base = "https://github.com/gamedevpl/www.gamedev.pl/releases/download/${CLI_RELEASE_PREFIX}$version"
$tmp = New-TemporaryFile | ForEach-Object { Remove-Item $_; New-Item -ItemType Directory -Path $_ }
try {
  $bin = Join-Path $tmp.FullName "gamedev.exe"
  $sums = Join-Path $tmp.FullName "SHA256SUMS"
  Invoke-WebRequest -UseBasicParsing "$base/$asset" -OutFile $bin
  Invoke-WebRequest -UseBasicParsing "$base/SHA256SUMS" -OutFile $sums
  $expected = (Select-String -Path $sums -Pattern $asset).Line.Split(" ")[0].ToLower()
  $actual = (Get-FileHash -Algorithm SHA256 $bin).Hash.ToLower()
  if ($expected -ne $actual) { throw "checksum mismatch for $asset" }
  New-Item -ItemType Directory -Force -Path $binDir | Out-Null
  Copy-Item $bin (Join-Path $binDir "gamedev.exe")
  Copy-Item $bin (Join-Path $binDir "git-remote-gamedev.exe")
  Write-Host "installed $binDir\\gamedev.exe"
} finally {
  Remove-Item -Recurse -Force $tmp
}
`;
}

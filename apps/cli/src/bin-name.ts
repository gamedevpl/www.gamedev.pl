export const CLI_BIN = 'gamedevpl';
export const GIT_REMOTE_SCHEME = 'gamedevpl';
export const GIT_REMOTE_HELPER = `git-remote-${GIT_REMOTE_SCHEME}`;

export function cliUsage(...parts: string[]): string {
  return [CLI_BIN, ...parts].join(' ');
}

export function gitRemoteUrl(slug: string): string {
  return `${GIT_REMOTE_SCHEME}://${slug}`;
}

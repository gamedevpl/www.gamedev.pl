export const CLI_BIN = 'gamedevpl';
export const GIT_REMOTE_HELPER = 'git-remote-gamedev';

export function cliUsage(...parts: string[]): string {
  return [CLI_BIN, ...parts].join(' ');
}

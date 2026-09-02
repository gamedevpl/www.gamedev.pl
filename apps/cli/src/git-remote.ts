export const GIT_REMOTE_CAPS = ['fetch', 'push', 'option'] as const;

export function remoteSlugFromArgv(argv: string[]): string {
  const url = argv[3] ?? argv[2] ?? '';
  return url.replace(/^gamedev:\/\//, '').replace(/\/$/, '');
}

export function handleHelperLine(line: string, slug: string): string[] {
  const [cmd, ...rest] = line.trim().split(' ');
  if (cmd === 'capabilities') return ['fetch', 'push', 'option', ''];
  if (cmd === 'list') {
    return [`@refs/heads/main HEAD`, `refs/heads/main ${rest.includes('for-push') ? 'unborn' : 'ready'}`, ''];
  }
  if (cmd === 'option') return ['ok'];
  if (!cmd) return [];
  return [`error ${slug}: unknown helper command ${cmd}`];
}

export function refuseNonFastForward(): string {
  return 'error working copy is unreconciled with the platform — gamedev pull, or pass --force';
}

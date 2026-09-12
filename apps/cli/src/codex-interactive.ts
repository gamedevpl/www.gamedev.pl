export function codexInteractiveArgs(headless: string[], prompt: string): string[] {
  const args: string[] = [];
  for (let i = 0; i < headless.length; i++) {
    const arg = headless[i];
    if (['exec', '--json', '--skip-git-repo-check', '--full-auto'].includes(arg)) continue;
    if (['-a', '--ask-for-approval', '-s', '--sandbox'].includes(arg)) {
      i++;
      continue;
    }
    args.push(arg);
  }
  return [
    ...args,
    '--sandbox',
    'workspace-write',
    '--ask-for-approval',
    'on-request',
    '-c',
    'approvals_reviewer="user"',
    '--no-alt-screen',
    prompt,
  ];
}

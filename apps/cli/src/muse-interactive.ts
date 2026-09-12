import type { AdapterSpec } from './adapters.js';

export function museInteractiveArgs(spec: AdapterSpec, session?: string): string[] {
  if (!session || !/^[a-f0-9-]{36}$/i.test(session)) throw new Error('Missing Muse session ID');
  const values = new Set([
    '--model',
    '--reasoning-effort',
    '--permission-profile',
    '--approval-judge',
    '--sandbox-network',
    '--provider',
    '--base-url',
    '--workspace',
  ]);
  const switches = new Set(['--disable-shell', '--disable-write']);
  const args: string[] = [];
  let approvalMode = 'on-request';
  for (let i = 0; i < spec.headless.length; i++) {
    const arg = spec.headless[i]!;
    const key = arg.split('=')[0]!;
    if (key === '--approval-mode' && (arg.split('=')[1] ?? spec.headless[i + 1]) === 'untrusted')
      approvalMode = 'untrusted';
    if (switches.has(key)) args.push(arg);
    else if (values.has(key)) {
      args.push(arg);
      if (!arg.includes('=') && spec.headless[i + 1]) args.push(spec.headless[++i]!);
    }
  }
  return [...args, '--trust-workspace', '--approval-mode', approvalMode, 'resume', session];
}

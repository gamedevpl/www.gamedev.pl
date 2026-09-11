import { existsSync, readFileSync, unlinkSync, appendFileSync } from 'node:fs';
import { sanitizeEventPayload } from './ansi.js';
export function terminalRecording(command: string, args: string[], path?: string) {
  if (!path || process.platform === 'win32' || !existsSync('/usr/bin/script'))
    return { command, args, finish: () => {} };
  const raw = `${path}.terminal`;
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  return {
    command: '/usr/bin/script',
    args:
      process.platform === 'darwin'
        ? ['-q', raw, command, ...args]
        : ['-q', '-e', '-c', [command, ...args].map(quote).join(' '), raw],
    finish() {
      if (!existsSync(raw)) return;
      try {
        const text = readFileSync(raw, 'utf8')
          .split('\n')
          .map((line) => sanitizeEventPayload(line, Infinity))
          .join('\n');
        appendFileSync(path, '\n── Interactive agent transcript ──\n' + text + '\n');
      } finally {
        if (existsSync(raw)) unlinkSync(raw);
      }
    },
  };
}

import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { sanitizeEventPayload } from './ansi.js';

export function compactTaskLine(text: string): string {
  if (text.includes(' ▸ ⚙ ')) {
    const [agent, command = ''] = text.split(' ▸ ⚙ ');
    const shell = /(?:\/|\b)(?:ba|z|fi)?sh\b/.test(command);
    return `${agent} · ${shell ? 'Running a shell command' : `Tool: ${command.split(/\s/)[0]}`}`;
  }
  if (text.startsWith('verify failed at ')) {
    const lines = text.split('\n').filter((line) => !/^\s*(?:>|PASS\b|node --|npm (?:run|error)|$)/.test(line));
    return ['\nValidation needs changes', ...lines, 'Full diagnostics: /logs'].join('\n');
  }
  return text;
}
export function taskOutput(write: (text: string) => void) {
  const path = join(mkdtempSync(join(tmpdir(), 'gamedev-task-')), 'transcript.txt');
  writeFileSync(path, '', { mode: 0o600 });
  let preparing = false;
  let lastTool = '';
  let repeats = 0;
  const flush = (): void => {
    if (repeats) write(`${lastTool.split(' · ')[0]} · +${repeats} more tool operations — /logs`);
    repeats = 0;
    lastTool = '';
  };
  return {
    path,
    flush,
    preparing(value: boolean) {
      preparing = value;
    },
    write(text: string) {
      const safe = text
        .split('\n')
        .map((line) => sanitizeEventPayload(line, Infinity))
        .join('\n');
      appendFileSync(path, safe + '\n');
      if (preparing && !/error|failed|refused|cannot/i.test(safe)) return;
      const shown = compactTaskLine(safe);
      const tool = /^[\w-]+ · (?:Running a shell command|Tool:)/.test(shown);
      if (tool && shown === lastTool) {
        repeats += 1;
        return;
      }
      flush();
      if (tool) lastTool = shown;
      if (shown) write(shown);
    },
  };
}

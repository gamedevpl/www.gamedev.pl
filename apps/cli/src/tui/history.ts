import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import type { SessionHistory } from '../session-controller.js';
export type History = SessionHistory;
const MAX_BYTES = 512_000;
const clean = (text: string): string =>
  stripVTControlCharacters(text)
    .replace(/\p{Cc}/gu, (character) => (character === '\n' || character === '\t' ? character : ''))
    .replace(/gdpl_(?:oat|pat)_[A-Za-z0-9_-]+/g, '[redacted]')
    .slice(0, 2000);
const strings = (value: unknown, limit: number): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .slice(-limit)
        .map(clean)
    : [];

export function historyStore(env: NodeJS.ProcessEnv, origin: string, uid: string, scope: string) {
  const key = createHash('sha256')
    .update(JSON.stringify([origin, uid, scope]))
    .digest('hex');
  const path = join(env.HOME ?? homedir(), '.config', 'gamedevpl', 'history', `${key}.json`);
  return {
    load(): History {
      try {
        if (statSync(path).size > MAX_BYTES) return { lines: [], prompts: [] };
        const data = JSON.parse(readFileSync(path, 'utf8')) as History;
        return {
          lines: strings(data.lines, 200),
          prompts: strings(data.prompts, 50),
          conversationId:
            typeof data.conversationId === 'string' && /^[a-f0-9-]{36}$/i.test(data.conversationId)
              ? data.conversationId
              : undefined,
        };
      } catch {
        return { lines: [], prompts: [] };
      }
    },
    save(history: History): void {
      const lines = strings(history.lines, 200);
      const prompts = strings(history.prompts, 50);
      const conversationId = history.conversationId?.slice(0, 200);
      let json = JSON.stringify({ lines, prompts, conversationId });
      while (Buffer.byteLength(json) > MAX_BYTES && (lines.length || prompts.length)) {
        if (lines.length) lines.shift();
        else prompts.shift();
        json = JSON.stringify({ lines, prompts, conversationId });
      }
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        writeFileSync(temporary, json, { mode: 0o600 });
        renameSync(temporary, path);
      } finally {
        try {
          unlinkSync(temporary);
        } catch {
          // Successful rename already removed the temporary file.
        }
      }
    },
  };
}

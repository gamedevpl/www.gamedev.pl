import { openSync, closeSync, fstatSync, readSync } from 'node:fs';
import { sanitizeEventPayload } from './ansi.js';
export function taskLogTail(path?: string): string[] {
  if (!path) return ['No local task log yet.'];
  let fd: number | undefined;
  try {
    fd = openSync(path, 'r');
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - 64 * 1024);
    const data = Buffer.alloc(size - start);
    const read = readSync(fd, data, 0, data.length, start);
    const lines = data.subarray(0, read).toString('utf8').split('\n');
    if (start) lines.shift();
    return lines
      .filter(Boolean)
      .slice(-200)
      .map((line) => sanitizeEventPayload(line, 1000));
  } catch {
    return ['Task log unavailable.'];
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

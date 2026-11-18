#!/usr/bin/env node
// Usage: node infra/session-score.mjs <session-events.json> [more.json ...]
import { readFileSync } from 'node:fs';
import { scoreSession } from './session-score-lib.mjs';

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error('usage: node infra/session-score.mjs <session-events.json> [more.json ...]');
  process.exit(2);
}
for (const path of paths) {
  const events = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(events)) throw new Error(`${path}: expected a JSON array of session events`);
  console.log(JSON.stringify({ file: path, ...scoreSession(events) }, null, 2));
}

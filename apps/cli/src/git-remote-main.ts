#!/usr/bin/env node
import { runCli } from './main.js';

void runCli(
  ['git-remote-gamedev', 'git-remote-gamedev', process.argv[2] ?? '', process.argv[3] ?? ''],
  process.env,
).then((code) => process.exit(code));

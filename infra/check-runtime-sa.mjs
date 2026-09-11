#!/usr/bin/env node
// Assert every Cloud Run deploy path pins a dedicated runtime identity and none can fall
// back to the project's default compute service account.
//
// The default compute account holds project-wide roles/editor, which makes every narrow
// grant in this directory cosmetic. Moving the services off it is only durable if BOTH
// deploy paths pass --service-account on every deploy — a value set once on the service
// is whatever the last deploy said, and `gcloud run deploy` without the flag keeps the
// previous value only until someone deploys without it from a fresh service. So this is
// checked in lint, where dropping the flag fails CI, rather than in the IAM policy months
// later. The live counterpart is the "Assert no service runs as the default compute
// account" step in deploy.yml, which reads the deployed spec back before promotion.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '..');

const DEFAULT_COMPUTE = /\d+-compute@developer\.gserviceaccount\.com/;

// One entry per file that deploys to Cloud Run. `flags` are the exact --service-account
// arguments the file must carry; on top of that, every `gcloud run deploy` / `services
// update` that sets an image is required to carry one, so an added deploy is caught too.
const PATHS = [
  {
    file: '.github/workflows/deploy.yml',
    flags: [
      '--service-account "$APP_RUNTIME_SA"',
      '--service-account "$RELAY_RUNTIME_SA"',
      '--service-account "$WORLD_RUNTIME_SA"',
    ],
    identities: {
      APP_RUNTIME_SA: 'gamedev-app@gamedevpl.iam.gserviceaccount.com',
      RELAY_RUNTIME_SA: 'gamedev-mp-relay@gamedevpl.iam.gserviceaccount.com',
      WORLD_RUNTIME_SA: 'gamedev-world@gamedevpl.iam.gserviceaccount.com',
    },
    // The live assertion must exist and must run before traffic moves.
    ordered: ['Assert no service runs as the default compute account', 'Promote candidate revision to 100% traffic'],
  },
  { file: 'infra/deploy-api.sh', flags: ['--service-account "$RUNTIME_SA"'] },
  { file: 'infra/deploy-relay.sh', flags: ['--service-account "$RUNTIME_SA"'] },
  { file: 'infra/deploy-world.sh', flags: ['--service-account "$RUNTIME_SA"'] },
];

const problems = [];

// Comment lines may mention the default account (that is where the reasoning lives); code
// lines may not. YAML and shell share the `#` convention, and the workflow's `run:` bodies
// are shell, so one filter covers both.
const codeOnly = (source) =>
  source
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

for (const entry of PATHS) {
  const source = readFileSync(path.join(repoRoot, entry.file), 'utf8');
  const code = codeOnly(source);

  // Every command that puts an image on a service must also say who runs it. A command
  // is the `gcloud run …` line plus its backslash-continued flags; an `update` that only
  // touches env (the relay's audience pin) sets no image and is not a deploy.
  const commands = code.match(/gcloud run (?:deploy|services update)(?:[^\n]*\\\n)*[^\n]*/g) ?? [];
  const deploys = commands.filter((command) => command.includes('--image'));
  const unpinned = deploys.filter((command) => !command.includes('--service-account'));
  if (deploys.length === 0) problems.push(`${entry.file}: no gcloud run deploy found — did the deploy move?`);
  for (const command of unpinned) {
    problems.push(`${entry.file}: deploy without --service-account: ${command.split('\n')[0].trim()}`);
  }
  for (const flag of entry.flags) {
    if (!code.includes(flag)) problems.push(`${entry.file}: missing ${flag}`);
  }
  if (DEFAULT_COMPUTE.test(code)) {
    problems.push(`${entry.file}: names the default compute account outside a comment`);
  }
  for (const [name, email] of Object.entries(entry.identities ?? {})) {
    if (!code.includes(`${name}: '${email}'`)) problems.push(`${entry.file}: ${name} is not pinned to ${email}`);
  }
  if (entry.ordered) {
    const [first, second] = entry.ordered.map((needle) => source.indexOf(needle));
    if (first < 0) problems.push(`${entry.file}: missing step "${entry.ordered[0]}"`);
    else if (second < 0) problems.push(`${entry.file}: missing step "${entry.ordered[1]}"`);
    else if (first > second)
      problems.push(`${entry.file}: "${entry.ordered[0]}" must run before "${entry.ordered[1]}"`);
  }
}

// The scripts derive the account from the service name; the workflow hard-codes the same
// three. If either side renames, the other must follow, or the deploy paths diverge.
for (const file of ['infra/deploy-api.sh', 'infra/deploy-relay.sh', 'infra/deploy-world.sh']) {
  const source = readFileSync(path.join(repoRoot, file), 'utf8');
  if (!source.includes('RUNTIME_SA="${RUNTIME_SA:-${SERVICE}@${PROJECT_ID}.iam.gserviceaccount.com}"')) {
    problems.push(`${file}: RUNTIME_SA must default to <SERVICE>@<PROJECT_ID>.iam.gserviceaccount.com`);
  }
}

if (problems.length > 0) {
  console.error('Runtime identity check failed:\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('\nSee infra/setup-runtime-sa.sh for why every deploy must pin --service-account.');
  process.exit(1);
}

console.log('Runtime identity: every Cloud Run deploy pins a dedicated service account.');

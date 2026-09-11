#!/usr/bin/env node
// Assert both deploy paths thread exactly the variables infra/env-manifest.json declares.
//
// Why this exists at all: gcloud --set-env-vars replaces the whole map, so a variable
// present in one path and missing from the other is deleted on the next deploy through
// that other path — silently, in production, possibly months later. See the manifest's
// own header and the incident note in infra/deploy-api.sh.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, '..');

const WORKFLOW = '.github/workflows/deploy.yml';
const SCRIPT = 'infra/deploy-api.sh';
const MANIFEST = 'infra/env-manifest.json';

const manifest = JSON.parse(readFileSync(path.join(repoRoot, MANIFEST), 'utf8'));
const declaredVars = new Set(manifest.vars);
const declaredSecrets = new Map(Object.entries(manifest.secrets));
const exempt = new Set(Object.keys(manifest.notServiceVars).filter((key) => key !== '$comment'));

// Names are read out of the shape both files actually use to build the map: `|NAME=` (or
// `^NAME=` for the first entry) inside the ENV_VARS string, and the bare names listed in
// the `for VAR in A B C; do` loops that append the optional ones. Deliberately textual —
// a checker that evaluated the shell would only be correct for the branch it happened to
// take, and the whole point is to see every name either file can ever emit.
function readVarNames(relPath) {
  const source = readFileSync(path.join(repoRoot, relPath), 'utf8');
  const names = new Set();
  for (const match of source.matchAll(/[|^]([A-Z][A-Z0-9_]*)=/g)) names.add(match[1]);
  for (const loop of source.matchAll(/for\s+[A-Z_]+\s+in\s+([^;]+?);?\s*do/g)) {
    for (const token of loop[1].split(/\s+/)) {
      if (/^[A-Z][A-Z0-9_]*$/.test(token)) names.add(token);
    }
  }
  for (const name of exempt) names.delete(name);
  // Secrets arrive via --set-secrets, checked separately below.
  for (const name of declaredSecrets.keys()) names.delete(name);
  return names;
}

function readSecretBindings(relPath) {
  const source = readFileSync(path.join(repoRoot, relPath), 'utf8');
  const bindings = new Map();
  for (const match of source.matchAll(/([A-Z][A-Z0-9_]*)=([a-z0-9-]+):latest/g)) {
    bindings.set(match[1], match[2]);
  }
  return bindings;
}

const problems = [];

for (const [label, relPath] of [
  ['deploy.yml', WORKFLOW],
  ['deploy-api.sh', SCRIPT],
]) {
  const actual = readVarNames(relPath);
  for (const name of [...actual].sort()) {
    if (!declaredVars.has(name)) {
      problems.push(`${label} threads ${name}, which ${MANIFEST} does not declare`);
    }
  }
  for (const name of [...declaredVars].sort()) {
    if (!actual.has(name)) {
      problems.push(`${label} does not thread ${name}, which ${MANIFEST} declares`);
    }
  }

  const secrets = readSecretBindings(relPath);
  for (const [name, secret] of [...secrets].sort()) {
    const declared = declaredSecrets.get(name);
    if (!declared) problems.push(`${label} binds secret ${name}, which ${MANIFEST} does not declare`);
    else if (declared !== secret) {
      problems.push(`${label} binds ${name} to ${secret}, but ${MANIFEST} says ${declared}`);
    }
  }
  for (const name of [...declaredSecrets.keys()].sort()) {
    if (!secrets.has(name)) problems.push(`${label} does not bind secret ${name}, which ${MANIFEST} declares`);
  }
}

if (problems.length > 0) {
  console.error(`Env manifest drift — ${problems.length} problem(s):\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(
    `\n--set-env-vars replaces the whole map, so a variable only one path threads is deleted` +
      `\nby the next deploy through the other. Fix by adding it to both paths and ${MANIFEST},` +
      `\nor, if it is not a service variable, by listing it under notServiceVars with a reason.`,
  );
  process.exit(1);
}

console.log(
  `Env manifest: ${declaredVars.size} variables and ${declaredSecrets.size} secrets, ` +
    `threaded identically by ${WORKFLOW} and ${SCRIPT}.`,
);

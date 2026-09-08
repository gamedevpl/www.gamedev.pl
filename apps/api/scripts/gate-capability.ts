// Capability for a hand-run gate. See infra/gate-hardening.md.

import { canonicalAppBaseUrl } from '../src/platform/canonical-app-url.js';
import { GATE_VERDICT_PATH } from '../src/delivery/gate-verdict-routes.js';
import { mintGateVerdictToken } from '../src/delivery/gate-verdict-token.js';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const slug = arg('slug');
const version = arg('version');
const secret = process.env.SUBMISSION_TOKEN_SECRET?.trim();

if (!slug || !version) {
  console.error('usage: gate:capability -- --slug <slug> --version <version>');
  process.exit(2);
}
if (!secret) {
  console.error('SUBMISSION_TOKEN_SECRET is required — the API signs capabilities with it');
  process.exit(2);
}

const token = mintGateVerdictToken(slug, version, secret);
const url = `${canonicalAppBaseUrl()}${GATE_VERDICT_PATH}`;

console.log(`_GATE_VERDICT_URL=${url}`);
console.log(`_GATE_VERDICT_TOKEN=${token}`);
console.error(`\nPass both to the build, e.g.:\n`);
console.error(
  `  gcloud builds submit --no-source --config infra/cloudbuild-gate.yaml \\\n` +
    `    --substitutions=_SLUG='${slug}',_VERSION='${version}',_GATE_VERDICT_URL='${url}',_GATE_VERDICT_TOKEN='${token}'\n`,
);

#!/usr/bin/env node
/**
 * Read-only GCP access for coding agents, without the gcloud CLI.
 *
 * Cloud agent sandboxes (Claude Code on the web, Cursor Cloud Agents) do not have gcloud
 * installed and cannot easily get it — but they do have this repo's node_modules, and
 * `google-auth-library` is already there via @google-cloud/firestore. So this talks to the
 * GCP REST APIs directly.
 *
 * Nothing here enforces read-only. The credential does: see docs/agent-gcp-access.md. This
 * is a convenience wrapper, not a security boundary — a `raw POST` that tries to mutate
 * something will simply come back 403, which is the design.
 *
 * Credentials, in resolution order:
 *   1. GCP_READONLY_KEY_B64  - base64 of the service-account key JSON (cloud sandboxes).
 *                              Parsed in memory; never written to disk.
 *   2. GCP_IMPERSONATE_SA    - impersonate this account using ambient ADC (local laptops).
 *   3. Application Default Credentials as-is.
 *
 * Usage:
 *   node infra/gcp-read.mjs logs 'severity>=ERROR' --limit 20
 *   node infra/gcp-read.mjs logs --since 2h
 *   node infra/gcp-read.mjs services
 *   node infra/gcp-read.mjs revisions gamedev-app --limit 5
 *   node infra/gcp-read.mjs describe gamedev-app
 *   node infra/gcp-read.mjs whoami
 *   node infra/gcp-read.mjs raw GET https://run.googleapis.com/v2/projects/gamedevpl/locations/europe-west1/services
 */
import { GoogleAuth, Impersonated } from 'google-auth-library';

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? 'gamedevpl';
const REGION = process.env.GCP_REGION ?? 'europe-west1';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

async function getClient() {
  const b64 = process.env.GCP_READONLY_KEY_B64;
  if (b64) {
    let credentials;
    try {
      credentials = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    } catch {
      fail(
        'GCP_READONLY_KEY_B64 is set but is not base64-encoded JSON. Re-encode with: base64 -i key.json | tr -d "\\n"',
      );
    }
    return new GoogleAuth({ credentials, scopes: [SCOPE] }).getClient();
  }

  const auth = new GoogleAuth({ scopes: [SCOPE] });
  const impersonate = process.env.GCP_IMPERSONATE_SA;
  if (impersonate) {
    // Local path: the owner's ADC borrows the read-only account, so an investigation run
    // from a laptop has exactly the same permissions as one from a sandbox.
    return new Impersonated({
      sourceClient: await auth.getClient(),
      targetPrincipal: impersonate,
      targetScopes: [SCOPE],
      lifetime: 3600,
    });
  }
  return auth.getClient();
}

async function call(client, method, url, body) {
  const res = await client.request({ url, method, data: body, validateStatus: () => true });
  if (res.status >= 400) {
    const detail = res.data?.error?.message ?? JSON.stringify(res.data);
    // 403 on a mutation is the credential working as intended, not a misconfiguration.
    fail(`${method} ${url}\n  HTTP ${res.status}: ${detail}`);
  }
  return res.data;
}

/** `--since 2h` / `30m` / `1d` -> a Logging API timestamp filter clause. */
function sinceClause(spec) {
  const m = /^(\d+)([mhd])$/.exec(spec ?? '');
  if (!m) fail(`--since expects e.g. 30m, 2h, 1d (got: ${spec})`);
  const mult = { m: 60, h: 3600, d: 86400 }[m[2]];
  const at = new Date(Date.now() - Number(m[1]) * mult * 1000).toISOString();
  return `timestamp >= "${at}"`;
}

function flag(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
}

const args = process.argv.slice(2);
const command = args.shift();
const limit = Number(flag(args, '--limit') ?? 20);
const since = flag(args, '--since');
const client = await getClient();

switch (command) {
  case 'logs': {
    // Defaults to Cloud Run because that is what every runbook starts from.
    const parts = [args[0] ?? 'resource.type="cloud_run_revision"'];
    if (since) parts.push(sinceClause(since));
    const data = await call(client, 'POST', 'https://logging.googleapis.com/v2/entries:list', {
      resourceNames: [`projects/${PROJECT_ID}`],
      filter: parts.join(' AND '),
      orderBy: 'timestamp desc',
      pageSize: limit,
    });
    const entries = data.entries ?? [];
    if (entries.length === 0) {
      // Worth saying out loud: an empty window is not evidence of health, only of silence.
      console.log('(no matching entries — note that a quiet window is not the same as a healthy one)');
      break;
    }
    for (const e of entries) {
      const payload = e.textPayload ?? JSON.stringify(e.jsonPayload ?? e.protoPayload ?? {});
      console.log(`${e.timestamp} ${(e.severity ?? 'DEFAULT').padEnd(8)} ${payload}`);
    }
    break;
  }

  case 'services': {
    const data = await call(
      client,
      'GET',
      `https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/services`,
    );
    for (const s of data.services ?? []) {
      console.log(`${s.name.split('/').pop().padEnd(20)} ${s.uri ?? ''}`);
    }
    break;
  }

  case 'revisions': {
    const service = args[0] ?? 'gamedev-app';
    const data = await call(
      client,
      'GET',
      `https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/services/${service}/revisions`,
    );
    const revisions = (data.revisions ?? []).sort((a, b) => (b.createTime ?? '').localeCompare(a.createTime ?? ''));
    for (const r of revisions.slice(0, limit)) {
      console.log(`${r.createTime} ${r.name.split('/').pop()}`);
    }
    break;
  }

  case 'describe': {
    const service = args[0] ?? fail('describe needs a service name');
    console.log(
      JSON.stringify(
        await call(
          client,
          'GET',
          `https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/services/${service}`,
        ),
        null,
        2,
      ),
    );
    break;
  }

  case 'whoami': {
    const data = await call(
      client,
      'POST',
      `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT_ID}:testIamPermissions`,
      {
        permissions: [
          'logging.logEntries.list',
          'monitoring.timeSeries.list',
          'run.services.get',
          'datastore.entities.get',
          'secretmanager.versions.access',
          'run.services.update',
          'storage.objects.delete',
          'resourcemanager.projects.setIamPolicy',
        ],
      },
    );
    const held = new Set(data.permissions ?? []);
    console.log(`project: ${PROJECT_ID}`);
    for (const p of [
      'logging.logEntries.list',
      'monitoring.timeSeries.list',
      'run.services.get',
      'datastore.entities.get',
      'secretmanager.versions.access',
      'run.services.update',
      'storage.objects.delete',
      'resourcemanager.projects.setIamPolicy',
    ]) {
      console.log(`  ${held.has(p) ? 'yes' : 'no '}  ${p}`);
    }
    break;
  }

  case 'raw': {
    const [method, url] = args;
    if (!method || !url) fail('raw needs: raw <METHOD> <URL> [jsonBody]');
    const body = args[2] ? JSON.parse(args[2]) : undefined;
    console.log(JSON.stringify(await call(client, method.toUpperCase(), url, body), null, 2));
    break;
  }

  default:
    console.log(`unknown command: ${command ?? '(none)'}

  logs [filter] [--limit N] [--since 2h]   Cloud Run logs (default filter: cloud_run_revision)
  services                                 list Cloud Run services
  revisions [service] [--limit N]          revision history, newest first
  describe <service>                       full service config as JSON
  whoami                                   show which permissions this credential holds
  raw <METHOD> <URL> [jsonBody]            any GCP REST endpoint

See docs/agent-gcp-access.md`);
    process.exit(command ? 1 : 0);
}

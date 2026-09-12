#!/usr/bin/env node
// Why this exists: docs/firestore-read-cost.md, "The deploy gate has no voice of its own".
//
//   node infra/check-deploy-freshness.mjs
//   GRACE_MINUTES=40 DEPLOY_TIMEOUT_MINUTES=60 node infra/check-deploy-freshness.mjs
//
// Exit: 0 deployed, 1 not deployed, 2 the check itself failed, 3 too early to judge.

const repo = process.env.GITHUB_REPOSITORY ?? 'gamedevpl/www.gamedev.pl';
const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
const graceMinutes = Number(process.env.GRACE_MINUTES ?? 25);
const deployTimeoutMinutes = Number(process.env.DEPLOY_TIMEOUT_MINUTES ?? 45);
const branch = process.env.DEPLOY_BRANCH ?? 'master';

const DEPLOYED = 0;
const STALE = 1;
const BROKEN = 2;
const TOO_EARLY = 3;

if (!token) {
  console.error('Set GITHUB_TOKEN (or GH_TOKEN) with actions:read.');
  process.exit(BROKEN);
}

async function api(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'gamedev-deploy-freshness',
    },
  });
  if (!response.ok) {
    console.error(`GitHub API ${response.status} for ${path}`);
    process.exit(BROKEN);
  }
  return response.json();
}

const minutesAgo = (iso) => (Date.now() - Date.parse(iso)) / 60_000;

const runsFor = async (workflow) =>
  (await api(`/repos/${repo}/actions/workflows/${workflow}/runs?branch=${branch}&per_page=30`)).workflow_runs ?? [];

// Only ever the newest settled run: an older one is a commit master has moved past.
const newest = (await runsFor('ci.yml')).find((run) => run.status === 'completed');

if (!newest) {
  console.log(`No CI run on ${branch} has settled yet.`);
  process.exit(TOO_EARLY);
}
if (minutesAgo(newest.updated_at) < graceMinutes) {
  console.log(`${newest.head_sha.slice(0, 9)} settled ${Math.round(minutesAgo(newest.updated_at))}m ago; deploying.`);
  process.exit(TOO_EARLY);
}

const sha = newest.head_sha;
const short = sha.slice(0, 9);
// Before the CI conclusion: workflow_dispatch deploys carry no such gate.
const deployRuns = (await runsFor('deploy.yml')).filter((run) => run.head_sha === sha);
const deployed = deployRuns.find((run) => run.conclusion === 'success');

if (deployed) {
  console.log(`${short} is deployed (${deployed.html_url}).`);
  process.exit(DEPLOYED);
}

const inFlight = deployRuns.find((run) => run.status !== 'completed');
if (inFlight) {
  const running = Math.round(minutesAgo(inFlight.created_at));
  if (running <= deployTimeoutMinutes) {
    console.log(`${short} has been deploying for ${running}m (${inFlight.html_url}).`);
    process.exit(TOO_EARLY);
  }
  console.error(`${short} has been deploying for ${running}m, past ${deployTimeoutMinutes}m.`);
  console.error(`  ${inFlight.html_url}`);
  process.exit(STALE);
}

if (newest.conclusion !== 'success') {
  console.error(`${branch} CI is ${newest.conclusion} at ${short}, so every deploy is skipped.`);
  console.error(`  ${newest.html_url}`);
  process.exit(STALE);
}

const latest = deployRuns[0];
console.error(`${short} passed CI ${Math.round(minutesAgo(newest.updated_at))}m ago and is not deployed.`);
console.error(latest ? `  deploy run ${latest.conclusion}: ${latest.html_url}` : '  no deploy run exists for it');
process.exit(STALE);

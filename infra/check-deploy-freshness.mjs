#!/usr/bin/env node
// Assert master's tip actually reached production, so nobody has to check by hand.
//
// The deploy job runs on `workflow_run` of CI and is gated on that run concluding
// success, so a red master silently stops every deploy: the PR that merged was green,
// its merge commit is on master, and production keeps serving the previous revision with
// nothing anywhere saying so. That happened on 2026-09-12 — master had been red since a
// direct push, and two merges deployed nothing.
//
// So this asks the only question that matters after a merge: does master's newest settled
// commit have a *successful* deploy run? A skipped deploy (CI red) and a failed deploy
// both answer no, which is the point — the failure modes look identical from the outside.
//
//   node infra/check-deploy-freshness.mjs
//   GRACE_MINUTES=40 node infra/check-deploy-freshness.mjs
//
// Needs GITHUB_TOKEN (or GH_TOKEN) with read access to actions.

const repo = process.env.GITHUB_REPOSITORY ?? 'gamedevpl/www.gamedev.pl';
const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
const graceMinutes = Number(process.env.GRACE_MINUTES ?? 25);
const branch = process.env.DEPLOY_BRANCH ?? 'master';

if (!token) {
  console.error('Set GITHUB_TOKEN (or GH_TOKEN) with actions:read.');
  process.exit(2);
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
    process.exit(2);
  }
  return response.json();
}

function minutesAgo(iso) {
  return (Date.now() - Date.parse(iso)) / 60_000;
}

const runsFor = async (workflow) =>
  (await api(`/repos/${repo}/actions/workflows/${workflow}/runs?branch=${branch}&per_page=30`)).workflow_runs ?? [];

const ciRuns = await runsFor('ci.yml');
const settled = ciRuns.filter((run) => run.status === 'completed');
// Newer commits may still be building; judging them would alarm on normal latency.
const candidate = settled.find((run) => minutesAgo(run.updated_at) >= graceMinutes);

if (!candidate) {
  console.log(`No CI run on ${branch} settled more than ${graceMinutes} minutes ago — nothing to judge yet.`);
  process.exit(0);
}

const sha = candidate.head_sha;
const short = sha.slice(0, 9);

if (candidate.conclusion !== 'success') {
  console.error(`master CI is ${candidate.conclusion} at ${short} — every deploy since is skipped.`);
  console.error(`  ${candidate.html_url}`);
  process.exit(1);
}

const deployRuns = (await runsFor('deploy.yml')).filter((run) => run.head_sha === sha);
const deployed = deployRuns.find((run) => run.conclusion === 'success');

if (deployed) {
  console.log(`${short} is deployed (${deployed.html_url}).`);
  process.exit(0);
}

const pending = deployRuns.find((run) => run.status !== 'completed');
if (pending) {
  console.log(`${short} is still deploying (${pending.html_url}).`);
  process.exit(0);
}

const latest = deployRuns[0];
console.error(`${short} passed CI ${Math.round(minutesAgo(candidate.updated_at))} minutes ago and is not deployed.`);
console.error(latest ? `  deploy run ${latest.conclusion}: ${latest.html_url}` : '  no deploy run exists for it');
process.exit(1);

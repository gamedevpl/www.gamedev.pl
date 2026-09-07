#!/usr/bin/env node
/**
 * Load test for the anonymous funnel: land -> catalog -> play -> telemetry flush.
 *
 * This is the shape a launch moment actually sends: strangers with no session,
 * arriving at once, most of them bouncing after one game. It is deliberately not a
 * synthetic hammer on one endpoint — the question is whether the *funnel* holds up,
 * and which step gives way first.
 *
 * Safety, because a load test aimed at the wrong thing is an outage you caused:
 *
 *   - `--target` is required. There is no default, and production is refused unless
 *     you also pass `--allow-production`. Point it at a candidate revision's URL.
 *   - Telemetry is OFF by default. It is the only step that WRITES, and a candidate
 *     revision shares Firestore with production, so driving it at load would push
 *     synthetic visits into the real funnel. `--telemetry` opts in knowingly.
 *   - Rate and duration default low enough to be a smoke test. Raising them is a
 *     deliberate act, and `--rate` above 50/s needs `--allow-production` too.
 *
 * Usage:
 *   node infra/load-test.mjs --target https://gamedev-app-xxxx-ew.a.run.app \
 *     --rate 25 --duration 120 --slug airtime
 *   node infra/load-test.mjs --target ... --report docs/load-test-2026-09.md
 */

const HELP = `Usage: node infra/load-test.mjs --target <base-url> [options]

  --target <url>        Base URL to drive. Required.
  --rate <n>            Visits started per second (default 2).
  --duration <seconds>  How long to keep starting visits (default 20).
  --slug <slug>         Game to play. Repeatable. Defaults to whatever
                        /api/health reports as publicly playable.
  --telemetry           Also send the visit flush. WRITES to the target's Firestore.
  --cookie <value>      Session cookie, for a target still behind the beta wall.
  --allow-production    Required to aim at www.gamedev.pl, or to exceed 50/s.
  --report <path>       Write a markdown report as well as printing one.
  --help                This.
`;

const PRODUCTION_HOSTS = new Set(['www.gamedev.pl', 'gamedev.pl', 'gamedevpl.web.app']);
const RATE_NEEDING_CONSENT = 50;

function parseArgs(argv) {
  const args = { rate: 2, duration: 20, slugs: [], telemetry: false, allowProduction: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => {
      const value = argv[(index += 1)];
      if (value === undefined) throw new Error(`${flag} needs a value`);
      return value;
    };
    switch (flag) {
      case '--target':
        args.target = next();
        break;
      case '--rate':
        args.rate = Number(next());
        break;
      case '--duration':
        args.duration = Number(next());
        break;
      case '--slug':
        args.slugs.push(next());
        break;
      case '--cookie':
        args.cookie = next();
        break;
      case '--report':
        args.report = next();
        break;
      case '--telemetry':
        args.telemetry = true;
        break;
      case '--allow-production':
        args.allowProduction = true;
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        throw new Error(`unknown argument: ${flag}`);
    }
  }
  return args;
}

function validate(args) {
  if (!args.target) throw new Error('--target is required; there is no default on purpose');
  const url = new URL(args.target);
  if (PRODUCTION_HOSTS.has(url.hostname) && !args.allowProduction) {
    throw new Error(`${url.hostname} is production. Pass --allow-production if you mean it.`);
  }
  if (args.rate > RATE_NEEDING_CONSENT && !args.allowProduction) {
    throw new Error(`--rate above ${RATE_NEEDING_CONSENT}/s needs --allow-production`);
  }
  if (!Number.isFinite(args.rate) || args.rate <= 0) throw new Error('--rate must be positive');
  if (!Number.isFinite(args.duration) || args.duration <= 0) throw new Error('--duration must be positive');
  return url;
}

/** One measurement per request, kept raw so percentiles are exact rather than binned. */
const steps = new Map();

function record(step, ms, ok, status) {
  const entry = steps.get(step) ?? { ms: [], ok: 0, failed: 0, statuses: new Map() };
  entry.ms.push(ms);
  if (ok) entry.ok += 1;
  else entry.failed += 1;
  entry.statuses.set(status, (entry.statuses.get(status) ?? 0) + 1);
  steps.set(step, entry);
}

async function timed(step, run) {
  const startedAt = performance.now();
  try {
    const response = await run();
    record(step, performance.now() - startedAt, response.ok, String(response.status));
    return response;
  } catch (error) {
    record(step, performance.now() - startedAt, false, error.name === 'TimeoutError' ? 'timeout' : 'network');
    return null;
  }
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index];
}

function headers(args, extra = {}) {
  return { ...(args.cookie ? { cookie: args.cookie } : {}), ...extra };
}

function randomUuid() {
  return crypto.randomUUID();
}

/** One visitor: lands, reads the catalog, plays one game, maybe flushes telemetry. */
async function visit(args, base, slug) {
  const get = (path) =>
    timed(path.startsWith('/api/games/') ? 'play' : path, () =>
      fetch(new URL(path, base), { headers: headers(args), signal: AbortSignal.timeout(30_000) }),
    );

  await get('/');
  await get('/api/catalog');
  if (slug) await get(`/api/games/${encodeURIComponent(slug)}`);

  if (!args.telemetry) return;
  await timed('/api/telemetry/visit', () =>
    fetch(new URL('/api/telemetry/visit', base), {
      method: 'POST',
      headers: headers(args, { 'content-type': 'application/json' }),
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        visitId: randomUuid(),
        flushMsSinceStart: 4_000,
        events: [
          { type: 'visit_started', entry: 'home', msSinceStart: 0 },
          { type: 'play_started', msSinceStart: 3_000 },
        ],
      }),
    }),
  );
}

async function playableSlugs(args, base) {
  if (args.slugs.length > 0) return args.slugs;
  const response = await fetch(new URL('/api/health', base), { headers: headers(args) });
  if (!response.ok) throw new Error(`/api/health answered ${response.status}; pass --slug instead`);
  const health = await response.json();
  const slugs = Array.isArray(health.publicPlaySlugs) ? health.publicPlaySlugs : [];
  if (slugs.length === 0 && health.privateBeta) {
    throw new Error('target is in closed beta with no promotional slugs; pass --slug and --cookie');
  }
  return slugs;
}

function report(args, base, elapsedSeconds, started) {
  const rows = [...steps.entries()].map(([step, entry]) => {
    const sorted = [...entry.ms].sort((a, b) => a - b);
    const worst = [...entry.statuses.entries()].sort((a, b) => b[1] - a[1]);
    return {
      step,
      count: entry.ms.length,
      failed: entry.failed,
      p50: Math.round(percentile(sorted, 0.5)),
      p95: Math.round(percentile(sorted, 0.95)),
      p99: Math.round(percentile(sorted, 0.99)),
      statuses: worst.map(([status, count]) => `${status}×${count}`).join(' '),
    };
  });

  const lines = [
    `# Load test — ${new Date().toISOString()}`,
    '',
    `Target: \`${base.origin}\``,
    `Visits started: ${started} over ${elapsedSeconds.toFixed(1)}s (requested ${args.rate}/s for ${args.duration}s)`,
    `Telemetry writes: ${args.telemetry ? 'on' : 'off'}`,
    '',
    '| Step | Requests | Failed | p50 ms | p95 ms | p99 ms | Statuses |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(
      (row) =>
        `| \`${row.step}\` | ${row.count} | ${row.failed} | ${row.p50} | ${row.p95} | ${row.p99} | ${row.statuses} |`,
    ),
    '',
    'Read it against the objectives in `docs/runbooks/launch-day.md`: catalog p95 under',
    '1.5s warm, and no step failing outside its own rate limiter.',
  ];
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }
  const base = validate(args);
  const slugs = await playableSlugs(args, base);

  process.stderr.write(
    `Driving ${base.origin} at ${args.rate} visits/s for ${args.duration}s` +
      `${slugs.length ? ` over ${slugs.length} slug(s)` : ' with no play step'}` +
      `${args.telemetry ? ', telemetry ON (writes)' : ''}\n`,
  );

  const inFlight = new Set();
  const startedAt = performance.now();
  const intervalMs = 1000 / args.rate;
  let started = 0;

  while ((performance.now() - startedAt) / 1000 < args.duration) {
    const slug = slugs.length ? slugs[started % slugs.length] : undefined;
    const running = visit(args, base, slug).finally(() => inFlight.delete(running));
    inFlight.add(running);
    started += 1;
    const drift = startedAt + started * intervalMs - performance.now();
    if (drift > 0) await new Promise((resolve) => setTimeout(resolve, drift));
  }
  await Promise.all(inFlight);

  const text = report(args, base, (performance.now() - startedAt) / 1000, started);
  process.stdout.write(`${text}\n`);
  if (args.report) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(args.report, `${text}\n`);
    process.stderr.write(`Report written to ${args.report}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

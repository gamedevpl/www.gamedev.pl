#!/usr/bin/env node
/**
 * Renders the real MCP round-status card against fixture payloads and writes
 * one PNG per state under /opt/cursor/artifacts (or --out).
 *
 * Usage: node --import tsx apps/api/scripts/screenshot-mcp-card.mjs
 */
import { mkdirSync, writeFileSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ROUND_STATUS_RESOURCE_URI, readUiResource } from '../src/agent-surface/mcp-ui.ts';

const DEFAULT_OUT = '/opt/cursor/artifacts/mcp-card-states';
const outFlag = process.argv.indexOf('--out');
let outDir = DEFAULT_OUT;
if (outFlag !== -1) {
  const value = process.argv[outFlag + 1];
  if (!value || value.startsWith('-')) {
    console.error('Usage: node --import tsx apps/api/scripts/screenshot-mcp-card.mjs [--out <dir>]');
    process.exit(1);
  }
  outDir = value;
}

const FALLBACK_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const NOW = '2026-08-07T00:20:00.000Z';
const NOTE_AT = '2026-08-07T00:17:00.000Z';
/** Chrome often writes the PNG then hangs in sandboxes — kill after this. */
const CHROME_TIMEOUT_MS = 20_000;

const chromeBin =
  process.env.CHROME_PATH ||
  ['google-chrome', 'chromium', 'chromium-browser'].find((bin) => spawnSync('which', [bin]).status === 0);

if (!chromeBin) {
  console.error('No chrome/chromium on PATH');
  process.exit(1);
}

const resource = readUiResource(ROUND_STATUS_RESOURCE_URI);
if (!resource?.text) {
  console.error('Could not read round-status resource');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const work = mkdtempSync(join(tmpdir(), 'mcp-card-'));

function chromeShot(url, outPath, size = '720,1200', scale = '2') {
  const result = spawnSync(
    chromeBin,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--hide-scrollbars',
      `--user-data-dir=${join(work, `ud-${Math.random().toString(36).slice(2)}`)}`,
      `--force-device-scale-factor=${scale}`,
      `--window-size=${size}`,
      `--screenshot=${outPath}`,
      url,
    ],
    { encoding: 'utf8', timeout: CHROME_TIMEOUT_MS, killSignal: 'SIGKILL' },
  );
  try {
    return readFileSync(outPath);
  } catch {
    const detail =
      result.error?.message ||
      (result.stderr && String(result.stderr).trim()) ||
      `exit ${result.status}`;
    throw new Error(`chrome screenshot failed: ${detail}`);
  }
}

/** Safe for embedding inside a <script> — escapes `<` so `</script>` cannot close early. */
function embedJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function bakeFrame(name, fill, label) {
  const htmlPath = join(work, `${name}-frame.html`);
  const pngPath = join(work, `${name}-frame.png`);
  writeFileSync(
    htmlPath,
    `<!doctype html><html><body style="margin:0;background:${fill};width:320px;height:180px;display:flex;align-items:center;justify-content:center;font:600 18px system-ui;color:#f2f4f5">${label}</body></html>`,
  );
  try {
    return chromeShot(pathToFileURL(htmlPath).href, pngPath, '320,180', '1').toString('base64');
  } catch {
    return FALLBACK_PNG;
  }
}

const frameA = bakeFrame('a', '#1a2740', 'Score 0');
const frameB = bakeFrame('b', '#243552', 'Score 1');
const frameC = bakeFrame('c', '#2e4464', 'Score 5');

const base = {
  title: 'Simple Arkanoid',
  slug: 'simple-arkanoid-2',
  round: 1,
  deliveriesRemaining: 18,
  playUrl: 'https://www.gamedev.pl/play/simple-arkanoid-2',
  studioUrl: 'https://www.gamedev.pl/studio/simple-arkanoid-2',
  siteUrl: 'https://www.gamedev.pl',
  retryAfterSeconds: 30,
  agentEnded: false,
  stall: null,
  note: null,
  presence: null,
  shot: null,
  gate: null,
};

const fixtures = {
  queued: {
    ...base,
    phase: 'queued',
    status: 'queued',
    stall: 'no_agent_yet',
  },
  building: {
    ...base,
    phase: 'building',
    status: 'building',
    presence: { key: 'reading_kit', at: NOW },
    note: {
      text: 'The pink rival paddle now tracks the ball with a capped reaction speed.',
      createdAt: NOTE_AT,
    },
    shot: {
      id: 'shot-1',
      createdAt: NOTE_AT,
      label: 'Playtest frame',
      png: frameA,
    },
  },
  gating: {
    ...base,
    phase: 'gating',
    status: 'building',
    agentEnded: true,
    stall: 'ended',
    note: {
      text: 'Submitted preview delivery for the pink paddle update.',
      createdAt: NOTE_AT,
    },
    gate: {
      status: 'pending',
      lane: 'preview',
      deliveryId: 'v20260806T221748222Z-4a9950',
      ranAt: null,
      summary: 'Delivered — waiting on the gate.',
    },
  },
  preview_passed: {
    ...base,
    phase: 'building',
    status: 'building',
    agentEnded: true,
    stall: 'ended',
    note: {
      text: 'The pink rival paddle now tracks the ball with a capped reaction speed, rebounds it from above, and is called out in the HUD and instructions.',
      createdAt: NOTE_AT,
    },
    gate: {
      status: 'preview_passed',
      lane: 'preview',
      deliveryId: 'v20260806T221748222Z-4a9950',
      ranAt: NOW,
      summary:
        'preview check passed — continue iterating, then submit_sources with mode=publish (TRACE required)',
      report:
        'check:game --preview passed against engine 39b773aa2fec9885fd77171b32ee6f42d4c03ec9; 5 artifact(s) stored',
    },
    _gallery: [
      { name: 'frame-0.png', png: frameA },
      { name: 'frame-1.png', png: frameB },
      { name: 'frame-2.png', png: frameC },
    ],
  },
  preview_failed: {
    ...base,
    phase: 'building',
    status: 'building',
    agentEnded: true,
    stall: 'ended',
    gate: {
      status: 'preview_failed',
      lane: 'preview',
      deliveryId: 'v20260806T221748222Z-fail',
      ranAt: NOW,
      summary: 'preview check refused this delivery',
      report: 'smoke failed: TypeError: paddle.update is not a function\n  at game/runtime.ts:88',
    },
  },
  published: {
    ...base,
    phase: 'published',
    status: 'published',
    agentEnded: true,
    deliveriesRemaining: 17,
    note: {
      text: 'Publish sealed. The pink paddle rival ships.',
      createdAt: NOW,
    },
    gate: {
      status: 'green',
      lane: 'publish',
      deliveryId: 'v20260806T230000000Z-pub',
      ranAt: NOW,
      summary: 'gate accepted this delivery',
      report: 'check:game passed; catalog entry published',
    },
    _gallery: [{ name: 'frame-0.png', png: frameA }],
  },
};

/**
 * Build a standalone page: the real card document, then a boot script that cannot
 * be closed early by `</script>` inside the card (card is the document itself).
 */
function pageFor(stateName, openDetails) {
  const fixture = fixtures[stateName];
  if (!fixture) throw new Error(`unknown state ${stateName}`);
  const gallery = fixture._gallery ?? null;
  const payload = { ...fixture };
  delete payload._gallery;

  // Append boot script before </body> of the real card HTML.
  const boot = `
<script>
(function () {
  var api = window.__gamedevRoundCard;
  if (!api) { document.body.textContent = 'Card API missing'; return; }
  var payload = ${embedJson(payload)};
  var gallery = ${embedJson(gallery)};
  api.render(payload);
  if (gallery) api.renderMedia({ frames: gallery, lane: payload.gate && payload.gate.lane });
  ${openDetails ? "var d = document.getElementById('details'); if (d) d.open = true;" : ''}
  document.documentElement.style.background = '#0f1214';
  document.body.style.background = '#0f1214';
})();
</script>`;

  return resource.text.replace('</body>', `${boot}\n  </body>`);
}

const jobs = [
  ['queued', false],
  ['building', false],
  ['gating', false],
  ['preview_passed', false],
  ['preview_passed', true],
  ['preview_failed', false],
  ['published', false],
];

for (const [state, openDetails] of jobs) {
  const label = openDetails ? `${state}_details` : state;
  const htmlPath = join(work, `${label}.html`);
  const out = join(outDir, `mcp-card-${label}.png`);
  writeFileSync(htmlPath, pageFor(state, openDetails));
  try {
    const buf = chromeShot(pathToFileURL(htmlPath).href, out);
    console.log('wrote', out, `(${buf.length} bytes)`);
  } catch (err) {
    console.error('screenshot failed', label, err);
    process.exitCode = 1;
  }
}

rmSync(work, { recursive: true, force: true });
console.log('done →', outDir);

#!/usr/bin/env node
/**
 * Agent-runner entrypoint.
 *
 * Reads a prompt + mode from env, runs an agent against a working copy of the
 * template, and emits a GameProject (see packages/game-generator/src/types.ts)
 * as JSON — to stdout (clean, no logs) and to OUTPUT_PATH (default
 * /out/game-project.json).
 *
 * Design constraints (see docs/risks-and-open-questions.md B1/B2):
 * - This harness is AGENT-AGNOSTIC. Which agent/CLI/auth runs inside is a runtime
 *   concern injected via env vars (AGENT_CMD/AGENT_ARGS), never hardcoded here.
 * - The default path (AGENT_MODE=mock) runs with ZERO tokens and ZERO network,
 *   so the whole container pipeline is provable locally.
 * - AGENT_MODE=external is pluggable but UNSET BY DEFAULT: with no AGENT_CMD it
 *   refuses to run, so nothing can spend money by accident.
 *
 * All diagnostics go to stderr; stdout is reserved for the GameProject JSON so
 * callers can parse it directly.
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(HERE, 'template');

/** The files that make up a GameProject on disk, in the working dir. */
const GAME_FILES = { html: 'index.html', js: 'game.js', css: 'style.css' };

const DEFAULT_TIMEOUT_MS = 600_000;

const log = (...args) => console.error('[agent-runner]', ...args);

function readTemplate(file) {
  return readFileSync(join(TEMPLATE_DIR, file), 'utf8');
}

function deriveTitle(prompt, fallback) {
  const cleaned = String(prompt ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!cleaned) return fallback;
  const words = cleaned.split(' ').slice(0, 6).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function fill(source, title, description) {
  return source.split('__TITLE__').join(title).split('__DESCRIPTION__').join(description);
}

/**
 * AGENT_MODE=mock — deterministic, offline. Fills the on-disk game template with
 * a title/description derived from the prompt. No network, no tokens.
 */
function runMock(prompt) {
  const title = deriveTitle(prompt, 'Hazard Dodge');
  const description = prompt.trim()
    ? `Generated from your idea: "${prompt.trim()}"`
    : 'A little arcade game, generated for you.';
  return {
    title,
    description,
    html: fill(readTemplate('index.html'), title, description),
    js: fill(readTemplate('game.js'), title, description),
    css: readTemplate('style.css'),
  };
}

/** Parses AGENT_ARGS (optional JSON array of strings) with a clear failure mode. */
function parseAgentArgs(raw) {
  if (raw === undefined || raw.trim() === '') return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `AGENT_ARGS is not valid JSON: ${error instanceof Error ? error.message : String(error)}. ` +
        'It must be a JSON array of strings, e.g. AGENT_ARGS=\'["--print","--permission-mode","acceptEdits"]\'.',
    );
  }
  if (!Array.isArray(parsed) || parsed.some((a) => typeof a !== 'string')) {
    throw new Error('AGENT_ARGS must be a JSON array of strings, e.g. \'["-p","--yes"]\'.');
  }
  return parsed;
}

/** Copies the pristine image template into a fresh scratch working dir. */
function makeWorkDir() {
  const explicit = process.env.AGENT_WORK_DIR;
  const dir = explicit && explicit.trim() ? explicit.trim() : mkdtempSync(join(tmpdir(), 'agent-runner-'));
  mkdirSync(dir, { recursive: true });
  cpSync(TEMPLATE_DIR, dir, { recursive: true });
  return dir;
}

/**
 * Spawns the configured agent command with an args ARRAY (never a shell string,
 * so the prompt cannot inject) in `cwd`. The child's stdout and stderr are both
 * forwarded to OUR stderr — our stdout stays reserved for the GameProject JSON.
 */
function spawnAgent({ cmd, args, cwd, prompt, promptEnvName, timeoutMs }) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(cmd, args, {
        cwd,
        env: { ...process.env, [promptEnvName]: prompt, AGENT_WORK_DIR: cwd },
        // stdin: pipe (we feed the prompt). stdout AND stderr are both wired
        // straight to OUR fd 2 — the child can never write to our stdout.
        stdio: ['pipe', 2, 2],
        shell: false,
      });
    } catch (error) {
      reject(new Error(`failed to spawn AGENT_CMD "${cmd}": ${error instanceof Error ? error.message : String(error)}`));
      return;
    }

    // The prompt is also offered on stdin, for CLIs that read it there.
    child.stdin.on('error', () => {
      /* agent may not read stdin — EPIPE is fine */
    });
    child.stdin.end(prompt);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`failed to run AGENT_CMD "${cmd}": ${error.message}`));
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`agent command "${cmd}" timed out after ${timeoutMs}ms (AGENT_TIMEOUT_MS) and was killed.`));
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `agent command "${cmd}" exited with code ${code ?? 'null'}${signal ? ` (signal ${signal})` : ''}. ` +
            'See the agent output above (forwarded to stderr) for details.',
        ),
      );
    });
  });
}

/** Pulls a value out of the produced html, e.g. the #game-title heading. */
function extractById(html, id) {
  const re = new RegExp(`<([a-zA-Z0-9]+)[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)</\\1>`, 'i');
  const match = html.match(re);
  if (!match) return '';
  return match[2]
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reads index.html / game.js / style.css back out of the working dir into a
 * GameProject. Missing or empty required files fail loudly, naming what's wrong.
 */
function collectProject(workDir, prompt) {
  const raw = {};
  const problems = [];
  for (const [key, file] of Object.entries(GAME_FILES)) {
    const path = join(workDir, file);
    if (!existsSync(path)) {
      problems.push(`${file} is missing`);
      continue;
    }
    const content = readFileSync(path, 'utf8');
    // style.css may legitimately be empty; html/js may not.
    if (key !== 'css' && !content.trim()) {
      problems.push(`${file} is empty`);
    }
    raw[key] = content;
  }
  if (problems.length > 0) {
    throw new Error(
      `agent finished but the working dir ${workDir} is not a usable game: ${problems.join(', ')}. ` +
        `Expected ${Object.values(GAME_FILES).join(', ')} at its root.`,
    );
  }

  const htmlTitle = extractById(raw.html, 'game-title');
  const htmlDesc = extractById(raw.html, 'game-desc');
  const title =
    htmlTitle && htmlTitle !== '__TITLE__' ? htmlTitle : deriveTitle(prompt, 'Generated Game');
  const description =
    htmlDesc && htmlDesc !== '__DESCRIPTION__'
      ? htmlDesc
      : prompt.trim()
        ? `Generated from your idea: "${prompt.trim()}"`
        : 'A little arcade game, generated for you.';

  return {
    title,
    description,
    // Any slot the agent left untouched still gets a sensible value.
    html: fill(raw.html, title, description),
    js: fill(raw.js, title, description),
    css: fill(raw.css ?? '', title, description),
  };
}

/**
 * AGENT_MODE=external — pluggable, agent-agnostic. Copies the template into a
 * scratch working dir, runs the configured AGENT_CMD there, then collects the
 * result. Nothing is provider-specific and nothing runs unless AGENT_CMD is set,
 * so the default remains free and safe. Note that running a subscription coding
 * CLI as multi-tenant backend compute is still an unresolved ToS question — see
 * docs/risks-and-open-questions.md (B1/B2).
 */
async function runExternal(prompt) {
  const cmd = (process.env.AGENT_CMD ?? '').trim();
  if (!cmd) {
    throw new Error(
      'AGENT_MODE=external requires AGENT_CMD — the coding-agent executable to run ' +
        '(e.g. AGENT_CMD=claude, AGENT_CMD=codex). It is unset by default so nothing runs and ' +
        'nothing costs money unless you explicitly configure it. Optional: AGENT_ARGS (JSON array), ' +
        'AGENT_TIMEOUT_MS, AGENT_PROMPT_ENV. Before enabling a subscription CLI as backend compute, ' +
        'read docs/risks-and-open-questions.md (B1/B2) — that ToS question is unresolved.',
    );
  }

  const args = parseAgentArgs(process.env.AGENT_ARGS);
  const promptEnvName = (process.env.AGENT_PROMPT_ENV ?? 'PROMPT').trim() || 'PROMPT';

  const rawTimeout = process.env.AGENT_TIMEOUT_MS;
  const timeoutMs = rawTimeout === undefined || rawTimeout.trim() === '' ? DEFAULT_TIMEOUT_MS : Number(rawTimeout);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`AGENT_TIMEOUT_MS must be a positive number of milliseconds, got ${JSON.stringify(rawTimeout)}.`);
  }

  const workDir = makeWorkDir();
  log(`external: workDir=${workDir} cmd=${cmd} args=${JSON.stringify(args)} timeoutMs=${timeoutMs}`);

  await spawnAgent({ cmd, args, cwd: workDir, prompt, promptEnvName, timeoutMs });
  log('external: agent exited 0, collecting working dir');

  return collectProject(workDir, prompt);
}

async function main() {
  const mode = (process.env.AGENT_MODE ?? 'mock').toLowerCase();
  const prompt = process.env.PROMPT ?? '';
  const outputPath = process.env.OUTPUT_PATH ?? '/out/game-project.json';

  log(`mode=${mode} prompt=${JSON.stringify(prompt.slice(0, 120))}`);

  let project;
  switch (mode) {
    case 'mock':
      project = runMock(prompt);
      break;
    case 'external':
      project = await runExternal(prompt);
      break;
    default:
      throw new Error(`Unknown AGENT_MODE "${mode}". Supported: mock, external.`);
  }

  const json = JSON.stringify(project);

  try {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, json);
    log(`wrote ${outputPath} (${json.length} bytes)`);
  } catch (error) {
    // A writable /out is optional — stdout is the primary contract.
    log(`could not write ${outputPath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  process.stdout.write(json);
}

main().catch((error) => {
  log(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

/**
 * The cross-repo lockstep check itself (issue #247), separated from the CI script
 * so its failure modes are unit-testable.
 *
 * Reads `tools/lib/assemble.ts`, `tools/validate.ts` and `shared/delivery-contract.json`
 * from the games repo and asserts they still match `games-repo-contract.ts` on this side.
 * Two outcomes are emphatically not the same thing, and the difference is why this lives
 * here:
 *
 *   - **drift** — the two halves disagree. That is the bug this check exists to
 *     catch, and it fails CI.
 *   - **unreachable** — the games repo could not be read at all (the shared PAT is
 *     out of quota, expired, or GitHub is down). That is no evidence about drift in
 *     either direction, so it must not read as one. `GAMES_REPO_TOKEN` is a single
 *     token shared with the snapshot bake, which spends thousands of contents reads
 *     per run; when it hits the hourly limit, every PR in this repo and master would
 *     otherwise go red on a check that never actually compared anything.
 *
 * The remaining defence against an unreachable remote silently disabling the check
 * is that it says so loudly — as a CI annotation, with GitHub's own rate-limit
 * headers — and that `GAMES_CONTRACT_REQUIRE_REMOTE=1` turns it back into a failure
 * for anyone who wants the strict posture.
 *
 * A games tip that has no `shared/delivery-contract.json` yet is a third thing again: a
 * successfully observed absence, not a failed read, and the expected state while this side
 * merges first. It is tolerated, annotated on the ok outcome, and — unlike an unreachable
 * remote — not turned into a failure by `GAMES_CONTRACT_REQUIRE_REMOTE`, which exists to
 * demand that the fetch happened, and it did.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DELIVERY_CONTRACT_PATH,
  DELIVERY_CONTRACT_VERSION,
  DELIVERY_EXTRA_MODULE_PATTERN,
  DELIVERY_FIXED_FILES,
  DELIVERY_MAX_FILES,
  DELIVERY_MAX_UPLOAD_BYTES,
  DELIVERY_RESERVED_SEGMENTS,
  EDITOR_CONTRACT_PATH,
  extractDeliveryContract,
  extractGameKitModules,
  extractGameKitVerticals,
  extractMaxBundleBytes,
  extractMusicContractSignals,
  GAME_KIT_MODULES,
  GAME_KIT_VERTICAL_ENTRIES,
  MAX_PROJECT_BYTES,
  stripLeadingDocComment,
  TS_ANY_SCAN_PATH,
  type DeliveryContract,
  type GameKitModuleName,
} from './games-repo-contract.js';
import { isRateLimitResponse } from './github-rate-limit.js';

const LOCAL_EDITOR_CONTRACT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../creation/editor-contract.ts',
);
const LOCAL_TS_ANY_SCAN_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '../creation/ts-any-scan.ts');

export type ContractCheckOutcome =
  /** No token configured — forks and fresh clones still go green. */
  | { kind: 'skipped'; reason: string }
  /** The games repo could not be read. Says nothing about drift. */
  | { kind: 'unreachable'; reason: string }
  /**
   * Every half that could be compared agrees. `notes` carries the halves that were
   * tolerated rather than compared, so a green run still says so out loud.
   */
  | { kind: 'ok'; notes?: string[] }
  /** The halves disagree — the failure this check is for. */
  | { kind: 'drift'; reason: string };

export interface ContractCheckOptions {
  repo: string;
  ref: string;
  token: string;
  fetchImpl?: typeof fetch;
  /** Progress lines (stdout in CI). */
  log?: (message: string) => void;
  /** Test seam — replaced so retry backoff does not slow the suite. */
  sleep?: (ms: number) => Promise<void>;
  /** Test seam for expiring website-first module rollout exceptions. */
  now?: () => number;
  /** Test seam — replaced so the editor-contract mirror check does not read real disk. */
  readLocalFile?: (path: string) => string;
}

/** Attempts per file, including the first. Bounded so a dead remote fails fast. */
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1_000;
/** Never wait longer than this for one retry — a CI job may not sit on a quota reset. */
const MAX_RETRY_DELAY_MS = 10_000;
/** Enough of GitHub's error body to name the cause without pasting a page of JSON. */
const MAX_BODY_CHARS = 300;

class UnreachableGamesRepoError extends Error {
  /** HTTP status of the last response, absent when the fault was below HTTP. */
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

/** True when `remote` is an exact prefix of `local` (same order; local may be longer). */
export function isModulePrefix(remote: string[], local: string[]): boolean {
  if (remote.length > local.length) return false;
  return remote.every((name, index) => local[index] === name);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 5xx and network faults are worth another go; 4xx other than a rate limit is not. */
function isTransientResponse(response: Response): boolean {
  return isRateLimitResponse(response) || response.status >= 500;
}

/**
 * GitHub's own account of the request: status, its `message` field, and the quota
 * headers. Without these a 403 is indistinguishable between "out of quota" and
 * "this token may not read that repo", which are opposite operator actions.
 */
async function describeFailure(response: Response): Promise<string> {
  const parts = [`${response.status} ${response.statusText}`];

  const body = await response.text().catch(() => '');
  if (body) {
    let message = body;
    try {
      const parsed = JSON.parse(body) as { message?: unknown };
      if (typeof parsed.message === 'string') {
        message = parsed.message;
      }
    } catch {
      // Not JSON — fall back to the raw body.
    }
    parts.push(message.slice(0, MAX_BODY_CHARS).trim());
  }

  const quota = describeQuota(response);
  if (quota) {
    parts.push(quota);
  }
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    parts.push(`retry-after=${retryAfter}s`);
  }
  return parts.filter(Boolean).join(' — ');
}

/** `used/limit` plus the reset time, when GitHub sent the headers. */
export function describeQuota(response: Response): string | null {
  const remaining = response.headers.get('x-ratelimit-remaining');
  const limit = response.headers.get('x-ratelimit-limit');
  if (remaining === null && limit === null) {
    return null;
  }
  const reset = Number(response.headers.get('x-ratelimit-reset'));
  const resetAt = Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000).toISOString() : null;
  return `rate limit ${remaining ?? '?'}/${limit ?? '?'} remaining${resetAt ? `, resets ${resetAt}` : ''}`;
}

/** Enough context around the first divergence to spot a botched merge without pasting the whole file. */
export function describeTextDrift(remote: string, local: string): string {
  const maxLen = Math.max(remote.length, local.length);
  let index = 0;
  while (index < maxLen && remote[index] === local[index]) index += 1;
  if (index === maxLen) return 'lengths differ but no character mismatch was found';
  const context = (text: string) => JSON.stringify(text.slice(Math.max(0, index - 20), index + 40));
  return (
    `first difference at offset ${index} (games-repo length ${remote.length}, website length ${local.length})\n` +
    `  games-repo: …${context(remote)}…\n` +
    `  website:    …${context(local)}…`
  );
}

/**
 * True when every `remote` module appears in `local` in the same relative order.
 * `local` may insert extra names (website-first GameKit module adds).
 */
export function isGameKitModuleSubsequence(remote: readonly string[], local: readonly string[]): boolean {
  let localIndex = 0;
  for (const name of remote) {
    const found = local.indexOf(name, localIndex);
    if (found === -1) return false;
    localIndex = found + 1;
  }
  return true;
}

export async function runGamesRepoContractCheck(options: ContractCheckOptions): Promise<ContractCheckOutcome> {
  const { repo, ref, token } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const log = options.log ?? (() => {});
  const sleep = options.sleep ?? defaultSleep;

  if (!token) {
    return {
      kind: 'skipped',
      reason:
        'GAMES_REPO_TOKEN unset — skipping live fetch. Unit tests still guard the website half; ' +
        'set a contents:read PAT on the games repo as the GAMES_REPO_TOKEN Actions secret to ' +
        'enable the cross-repo check.',
    };
  }

  async function readGamesRepoFile(path: string): Promise<string> {
    const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`;
    let lastFailure = 'no attempt was made';
    let lastStatus: number | undefined;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        response = await fetchImpl(url, {
          headers: {
            Accept: 'application/vnd.github.raw',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'gamedevpl-games-repo-contract-check',
          },
        });
      } catch (error: unknown) {
        // A network fault is transient by definition — retry it like a 5xx.
        lastFailure = error instanceof Error ? error.message : String(error);
        lastStatus = undefined;
        if (attempt + 1 < MAX_ATTEMPTS) {
          await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
          continue;
        }
        break;
      }

      if (response.ok) {
        const quota = describeQuota(response);
        if (quota) {
          log(`  · ${path}: ${quota}`);
        }
        return response.text();
      }

      lastFailure = await describeFailure(response);
      lastStatus = response.status;
      if (!isTransientResponse(response) || attempt + 1 >= MAX_ATTEMPTS) {
        break;
      }

      const retryAfterSeconds = Number(response.headers.get('retry-after'));
      const delayMs =
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : RETRY_BASE_DELAY_MS * 2 ** attempt;
      if (delayMs > MAX_RETRY_DELAY_MS) {
        break;
      }
      log(`  · ${path}: ${lastFailure} — retrying in ${Math.round(delayMs / 1000)}s`);
      await sleep(delayMs);
    }

    throw new UnreachableGamesRepoError(`cannot read ${repo}@${ref}:${path} (${lastFailure})`, lastStatus);
  }

  /**
   * Same read, but a 404 answers `null`. Only for halves this side is allowed to be ahead
   * on: a games tip that predates the file is the expected state during a website-first
   * rollout, and treating it as unreachable would make the ordering rule unusable. A wrong
   * repo or ref cannot slip through as "absent": it 404s the two required files as well,
   * and those reject the whole run as unreachable whatever this one answered.
   */
  async function readOptionalGamesRepoFile(path: string): Promise<string | null> {
    try {
      return await readGamesRepoFile(path);
    } catch (error: unknown) {
      if (error instanceof UnreachableGamesRepoError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  let assembleSource: string;
  let validateSource: string;
  let deliverySource: string | null;
  let editorContractSource: string;
  let anyScanSource: string | null;
  try {
    [assembleSource, validateSource, deliverySource, editorContractSource, anyScanSource] = await Promise.all([
      readGamesRepoFile('tools/lib/assemble.ts'),
      readGamesRepoFile('tools/validate.ts'),
      readOptionalGamesRepoFile(DELIVERY_CONTRACT_PATH),
      readGamesRepoFile(EDITOR_CONTRACT_PATH),
      // Optional for the same reason as the delivery contract: this side lands first, and
      // an absent file on the games tip is an observed absence, not a failed read.
      readOptionalGamesRepoFile(TS_ANY_SCAN_PATH),
    ]);
  } catch (error: unknown) {
    if (error instanceof UnreachableGamesRepoError) {
      return { kind: 'unreachable', reason: error.message };
    }
    throw error;
  }

  const remoteModules = extractGameKitModules(assembleSource);
  const localModules = [...GAME_KIT_MODULES];
  // Website-first module adds are intentional (same rule as budget raises): the serve
  // half may know about a module the published games tip has not selected yet. Fail
  // only when games-repo ships a module (or reorders shared ones) this side does not
  // recognize — that would 502 every game that asks for it.
  //
  // Guard: the extras must be explicitly declared website-ahead modules (below).
  // Without this, a games-repo rollback of a module would pass silently because
  // the remaining modules are still a subsequence. See Codex review on PR #379.
  if (!isGameKitModuleSubsequence(remoteModules, localModules)) {
    return {
      kind: 'drift',
      reason:
        `GAME_KIT_MODULES mismatch.\n  games-repo: ${remoteModules.join(', ')}\n` +
        `  website:    ${localModules.join(', ')}\n` +
        `  Every games-repo module must appear on the website in the same relative order ` +
        `(website may list extra modules ahead of the games tip — merge website first).`,
    };
  }

  // Website-first exceptions must expire. A permanent allowlist would turn a later
  // games-repo rollback into an apparently intentional rollout state. Remove an entry
  // as soon as its paired games change lands; the deadline is the fail-closed backstop.
  const WEBSITE_AHEAD_EXPIRY: ReadonlyMap<string, number> = new Map([
    ['football', Date.parse('2026-08-10T00:00:00.000Z')],
    ['vehicles', Date.parse('2026-09-01T00:00:00.000Z')],
    ['urban', Date.parse('2026-08-11T00:00:00.000Z')],
    ['cards', Date.parse('2026-08-15T00:00:00.000Z')],
    // games-repo #690 (platformer vertical). Remove once it lands.
    ['platformer', Date.parse('2026-08-29T00:00:00.000Z')],
  ]);
  const websiteExtras = localModules.filter((m) => !remoteModules.includes(m));
  const now = options.now?.() ?? Date.now();
  const invalidExtras = websiteExtras.filter((m) => {
    const expiry = WEBSITE_AHEAD_EXPIRY.get(m);
    return expiry === undefined || now >= expiry;
  });
  if (invalidExtras.length > 0) {
    return {
      kind: 'drift',
      reason:
        `Undeclared or expired website-ahead modules: ${invalidExtras.join(', ')}.\n` +
        `  If these are intentional new modules, add a short-lived deadline to ` +
        `WEBSITE_AHEAD_EXPIRY in games-repo-contract-check.ts. Remove it as soon as the paired ` +
        `games change lands; if games-repo removed the module, update GAME_KIT_MODULES.`,
    };
  }
  if (remoteModules.join(',') !== localModules.join(',')) {
    log(
      `  ✓ GAME_KIT_MODULES (games ${remoteModules.length}, website ${localModules.length}; ` +
        `website-ahead extras: ${websiteExtras.join(', ')})`,
    );
  } else {
    log(`  ✓ GAME_KIT_MODULES (${remoteModules.length} modules)`);
  }

  // Names agreeing is not the same as resolving to the same file. A module promoted to a
  // vertical keeps its name in GAME_KIT_MODULES, so the check above stays green while this
  // side still reads `shared/modules/<name>.ts` and finds nothing — which surfaces as
  // "game sources not found on ref" in the nightly bake, one game short of a snapshot.
  //
  // An assemble source with no verticals literal at all is a shape this side does not
  // recognize rather than evidence of drift — same tolerance the delivery half gets — so
  // it becomes a note on an otherwise green run instead of a failure.
  let remoteVerticals: Record<string, string>;
  let verticalNote: string | null = null;
  try {
    remoteVerticals = extractGameKitVerticals(assembleSource);
  } catch (error: unknown) {
    remoteVerticals = {};
    verticalNote = `GAME_KIT_VERTICALS not compared: ${error instanceof Error ? error.message : String(error)}`;
  }
  const verticalDrift: string[] = [];
  for (const [name, remotePath] of Object.entries(remoteVerticals)) {
    // Only modules this side recognizes matter: a vertical for a games-repo-only module
    // is the website-behind case the module check already rules on.
    if (!(GAME_KIT_MODULES as readonly string[]).includes(name)) continue;
    const localPath = GAME_KIT_VERTICAL_ENTRIES[name as GameKitModuleName];
    if (localPath === undefined) {
      verticalDrift.push(`${name}: games-repo=${remotePath} website=(resolved as shared/modules/${name}.ts)`);
    } else if (localPath !== remotePath) {
      verticalDrift.push(`${name}: games-repo=${remotePath} website=${localPath}`);
    }
  }
  if (verticalDrift.length > 0) {
    return {
      kind: 'drift',
      reason:
        `GAME_KIT_VERTICALS mismatch.\n${verticalDrift.map((entry) => `  ${entry}`).join('\n')}\n` +
        `  Every games-repo vertical must resolve to the same entry path in ` +
        `GAME_KIT_VERTICAL_ENTRIES in apps/api/src/catalog/games-repo-contract.ts, or the bake cannot ` +
        `find the module's source and every game selecting it fails to publish.`,
    };
  }
  if (verticalNote) {
    log(`  – GAME_KIT_VERTICALS (not compared)`);
  } else {
    log(`  ✓ GAME_KIT_VERTICALS (${Object.keys(remoteVerticals).length} verticals)`);
  }

  const remoteBudget = extractMaxBundleBytes(validateSource);
  if (remoteBudget > MAX_PROJECT_BYTES) {
    const assignLine =
      validateSource
        .split('\n')
        .find((line) => /MAX_BUNDLE_BYTES\s*=/.test(line))
        ?.trim() ?? '(assignment line not found)';
    return {
      kind: 'drift',
      reason:
        `MAX_BUNDLE_BYTES mismatch: games-repo=${remoteBudget} website MAX_PROJECT_BYTES=${MAX_PROJECT_BYTES}\n` +
        `  games-repo assignment: ${assignLine}\n` +
        `  Website is behind the build ceiling — raise GAMEKIT_PLATFORM_BYTES / MAX_PROJECT_BYTES ` +
        `in apps/api/src/catalog/games-repo-contract.ts (website-first).`,
    };
  }
  if (MAX_PROJECT_BYTES > remoteBudget) {
    log(`  ✓ MAX_BUNDLE_BYTES / MAX_PROJECT_BYTES (website ahead: ${MAX_PROJECT_BYTES} > remote ${remoteBudget})`);
  } else {
    log(`  ✓ MAX_BUNDLE_BYTES / MAX_PROJECT_BYTES (${remoteBudget})`);
  }

  const music = extractMusicContractSignals(assembleSource);
  if (!music.injectsMusicName || !music.readsTracksKey || !music.readsMusicCatalog) {
    const musicLines = assembleSource
      .split('\n')
      .map((line, index) => ({ line: line.trim(), n: index + 1 }))
      .filter(({ line }) => /music|__GAME_AUDIO|__GAME_MUSIC|tracks/i.test(line))
      .slice(0, 40)
      .map(({ line, n }) => `  L${n}: ${line}`)
      .join('\n');
    return {
      kind: 'drift',
      reason:
        `music contract mismatch in games-repo assemble.ts: ` +
        `injectsMusicName=${music.injectsMusicName} readsTracksKey=${music.readsTracksKey} ` +
        `readsMusicCatalog=${music.readsMusicCatalog}\nrelevant lines:\n${musicLines || '  (none)'}`,
    };
  }
  log('  ✓ music contract (__GAME_AUDIO_MUSIC__ + tracks + readMusicCatalog)');

  const readLocalFile = options.readLocalFile ?? ((filePath: string) => readFileSync(filePath, 'utf8'));
  const localEditorContract = stripLeadingDocComment(readLocalFile(LOCAL_EDITOR_CONTRACT_PATH));
  const remoteEditorContract = stripLeadingDocComment(editorContractSource);
  if (localEditorContract !== remoteEditorContract) {
    return {
      kind: 'drift',
      reason:
        `editor-contract mismatch (${EDITOR_CONTRACT_PATH} vs apps/api/src/creation/editor-contract.ts): ` +
        `${describeTextDrift(remoteEditorContract, localEditorContract)}\n` +
        `  The two files must stay byte-equivalent below their own header comments — EditorKit L0/L4 ` +
        `is a lockstep, not an asymmetric rollout contract. Update both files in one paired change.`,
    };
  }
  log('  ✓ editor-contract (EditorKit L0/L4, byte-equivalent below the header)');

  if (anyScanSource !== null) {
    const localAnyScan = stripLeadingDocComment(readLocalFile(LOCAL_TS_ANY_SCAN_PATH));
    const remoteAnyScan = stripLeadingDocComment(anyScanSource);
    if (localAnyScan !== remoteAnyScan) {
      return {
        kind: 'drift',
        reason:
          `ts-any-scan mismatch (${TS_ANY_SCAN_PATH} vs apps/api/src/creation/ts-any-scan.ts): ` +
          `${describeTextDrift(remoteAnyScan, localAnyScan)}\n` +
          `  The two files must stay byte-equivalent below their own header comments. This side ` +
          `refuses an upload for \`any\` and the games repo fails validate Check 37 for it; if they ` +
          `disagree, an agent is told yes here and no at the gate. Update both files in one paired change.`,
      };
    }
    log('  ✓ ts-any-scan (byte-equivalent below the header)');
  }

  const notes: string[] = [];
  if (verticalNote) {
    notes.push(verticalNote);
  }
  if (anyScanSource === null) {
    notes.push(
      `${TS_ANY_SCAN_PATH} is absent from ${repo}@${ref} (404) — the \`any\` scan was NOT compared. ` +
        `Expected only while this side is ahead of the games tip.`,
    );
    log(`  · ${TS_ANY_SCAN_PATH}: absent on the games tip — \`any\` scan not compared`);
  }
  if (deliverySource === null) {
    notes.push(
      `${DELIVERY_CONTRACT_PATH} is absent from ${repo}@${ref} (404) — the delivery half was NOT ` +
        `compared. Expected only while this side is ahead of the games tip; if the file has landed ` +
        `there, GAMES_PUBLISHED_REF is probably pointing at an older ref.`,
    );
    log(`  · ${DELIVERY_CONTRACT_PATH}: absent on the games tip — delivery half not compared`);
  } else {
    let remoteDelivery: DeliveryContract;
    try {
      remoteDelivery = extractDeliveryContract(deliverySource);
    } catch (error: unknown) {
      return { kind: 'drift', reason: error instanceof Error ? error.message : String(error) };
    }
    const delivery = describeDeliveryDrift(remoteDelivery);
    if (delivery.drift) {
      return { kind: 'drift', reason: delivery.drift };
    }
    notes.push(...delivery.notes);
    log(`  ✓ delivery contract (${remoteDelivery.fixedFiles.length} fixed files, ${remoteDelivery.maxFiles} max)`);
  }

  return notes.length > 0 ? { kind: 'ok', notes } : { kind: 'ok' };
}

/**
 * Compare the games repo's delivery contract against this side's constants.
 *
 * Asymmetric, and deliberately so — it enforces the ordering rule rather than mere
 * equality. A path the games repo sends and this side refuses is the bug the whole check
 * exists for: every delivery carrying it 400s at upload. The reverse — this side accepting
 * a path no game sends yet — is the *intended* middle state of a website-first rollout, so
 * failing on it would make the documented safe order the one that turns master red, and the
 * unsafe order the comfortable one. It is reported as a note instead, loudly enough that a
 * permanently half-landed change is still visible.
 *
 * Same asymmetry the GameKit module half already uses for website-ahead extras, arrived at
 * for the same reason.
 */
function describeDeliveryDrift(remote: DeliveryContract): { drift: string | null; notes: string[] } {
  const localFixed = [...DELIVERY_FIXED_FILES] as string[];
  const problems: string[] = [];
  const notes: string[] = [];

  if (remote.version !== DELIVERY_CONTRACT_VERSION) {
    problems.push(
      `version: games-repo=${remote.version} website=${DELIVERY_CONTRACT_VERSION} — the contract ` +
        `shape changed; update extractDeliveryContract before the values.`,
    );
  }

  // The two directions are different bugs with different fixes, so they are never
  // collapsed into one "lists differ" line.
  const addedByGames = remote.fixedFiles.filter((path) => !localFixed.includes(path));
  const websiteOnly = localFixed.filter((path) => !remote.fixedFiles.includes(path));
  if (addedByGames.length > 0) {
    problems.push(
      `fixedFiles the games repo sends and this side refuses: ${addedByGames.join(', ')} — every ` +
        `delivery carrying one 400s at upload. Add them to DELIVERY_FIXED_FILES now.`,
    );
  }
  if (websiteOnly.length > 0) {
    notes.push(
      `delivery contract: this side accepts ${websiteOnly.join(', ')}, which the games repo does not ` +
        `list yet. Harmless to deliveries and expected mid-rollout (this side widens first), but if the ` +
        `paired games-repo change is not on its way, drop the entries here.`,
    );
  }

  // Order is contractual — both sides render this list into agent-facing text — but only
  // over what both sides have. Comparing full lists would re-fail the website-ahead case
  // above as a phantom reorder.
  const sharedRemote = remote.fixedFiles.filter((path) => localFixed.includes(path));
  const sharedLocal = localFixed.filter((path) => remote.fixedFiles.includes(path));
  if (addedByGames.length === 0 && sharedRemote.join(',') !== sharedLocal.join(',')) {
    problems.push(
      `fixedFiles order differs — games-repo: ${sharedRemote.join(', ')}; website: ${sharedLocal.join(', ')}. ` +
        `Order is contractual: both sides render this list into agent-facing text.`,
    );
  }

  if (remote.extraModulePattern !== DELIVERY_EXTRA_MODULE_PATTERN.source) {
    problems.push(
      `extraModulePattern: games-repo=${remote.extraModulePattern} ` +
        `website=${DELIVERY_EXTRA_MODULE_PATTERN.source}`,
    );
  }

  // Order carries no meaning for reserved segments — both sides use them as a set.
  const localSegments = [...DELIVERY_RESERVED_SEGMENTS].sort();
  const remoteSegments = [...remote.reservedSegments].sort();
  if (localSegments.join(',') !== remoteSegments.join(',')) {
    problems.push(`reservedSegments: games-repo=${remoteSegments.join(', ')} website=${localSegments.join(', ')}`);
  }

  // Caps get the same directional treatment as the file list, for the same reason: a
  // games repo that advertises a *higher* cap than this side accepts sends deliveries
  // that 400, while this side accepting more than the games repo advertises is inert and
  // is what a website-first raise looks like in the middle. Comparing for equality would
  // make the safe order red and the unsafe order comfortable.
  for (const cap of [
    { name: 'maxFiles', remote: remote.maxFiles, local: DELIVERY_MAX_FILES },
    { name: 'maxUploadBytes', remote: remote.maxUploadBytes, local: DELIVERY_MAX_UPLOAD_BYTES },
  ]) {
    if (cap.remote > cap.local) {
      problems.push(
        `${cap.name}: games-repo=${cap.remote} exceeds website=${cap.local} — deliveries sized for the ` +
          `games-repo cap are refused at upload. Raise this side first.`,
      );
    } else if (cap.remote < cap.local) {
      notes.push(
        `delivery contract: this side allows ${cap.name}=${cap.local} against the games repo's ${cap.remote}. ` +
          `Harmless and expected mid-rollout (this side widens first); land the paired games-repo change.`,
      );
    }
  }

  if (problems.length === 0) {
    return { drift: null, notes };
  }
  return {
    drift:
      `delivery contract mismatch (${DELIVERY_CONTRACT_PATH} vs apps/api/src/catalog/games-repo-contract.ts):\n` +
      problems.map((problem) => `  - ${problem}`).join('\n'),
    notes,
  };
}

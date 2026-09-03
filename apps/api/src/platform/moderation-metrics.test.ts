import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { logModerationRejection, MODERATION_REJECTED_MSG } from './moderation-metrics.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Captures what a pino logger would have been handed. */
function fakeLog() {
  const warn: Array<{ obj: unknown; msg: unknown }> = [];
  return {
    warn,
    logger: {
      warn: (obj: unknown, msg: unknown) => warn.push({ obj, msg }),
    } as never,
  };
}

describe('logModerationRejection', () => {
  it('logs the surface, the category and the uid', () => {
    const { warn, logger } = fakeLog();
    logModerationRejection(logger, { surface: 'submission', uid: 'g:123', category: 'hate' });

    expect(warn).toHaveLength(1);
    expect(warn[0]?.obj).toEqual({ moderation: { surface: 'submission', category: 'hate', uid: 'g:123' } });
  });

  it('uses a stable message, because a log filter matches on it', () => {
    // If this string changes, the log-based metric in infra/setup-monitoring.sh stops
    // matching and the alert goes quiet without failing — the worst shape of breakage.
    // Pinned to the literal here so a rename has to be a deliberate two-file change.
    const { warn, logger } = fakeLog();
    logModerationRejection(logger, { surface: 'contact' });

    expect(MODERATION_REJECTED_MSG).toBe('moderation rejected');
    expect(warn[0]?.msg).toBe(MODERATION_REJECTED_MSG);
  });

  it('records a missing category as `other` rather than omitting it', () => {
    // An absent field silently drops the entry out of any breakdown grouped by category,
    // so the rejection would be counted but invisible in the one view that explains it.
    const { warn, logger } = fakeLog();
    logModerationRejection(logger, { surface: 'refine' });

    expect(warn[0]?.obj).toEqual({ moderation: { surface: 'refine', category: 'other', uid: 'anonymous' } });
  });

  it('records a missing uid as `anonymous`', () => {
    // The contact form sits outside the beta wall on purpose, so most writers have no
    // session. That is a real case, not a bug, and it must still be counted.
    const { warn, logger } = fakeLog();
    logModerationRejection(logger, { surface: 'contact', category: 'sexual' });

    expect((warn[0]?.obj as { moderation: { uid: string } }).moderation.uid).toBe('anonymous');
  });

  it('never logs the rejected text', () => {
    // The signature has no field for it, which is the actual guard — this test exists so
    // that adding one is a visible decision. The rejected text is the abusive content
    // itself; writing it into Cloud Logging would give user-authored abuse material a
    // second home with its own retention and no erasure path, in service of a feature
    // whose whole purpose is keeping that material out.
    const { warn, logger } = fakeLog();
    logModerationRejection(logger, { surface: 'player_feedback', uid: 'g:1', category: 'harassment' });

    expect(JSON.stringify(warn[0])).not.toMatch(/text|prompt|concept|message/i);
  });
});

/**
 * The coupling that makes the metric trustworthy.
 *
 * A count is only worth alerting on if every rejection reaches it. There are seven call
 * sites across six modules, and the failure mode is not that someone breaks this — it is
 * that someone adds an eighth surface, handles its 422 correctly, and never thinks about
 * the counter. The metric then keeps working, keeps looking healthy, and stops being a
 * count of anything in particular.
 *
 * So the check is structural: any module that moderates text must also report rejections.
 * Same discipline as firestore-indexes.test.ts — a lint over source text that asserts it
 * found what it expected, because a guard matching nothing reads as coverage.
 */
describe('every moderating module reports its rejections', () => {
  const MODERATES = /checkFields\(|contentChecker\.check\(|moderateFields\(|moderateText\(/;

  // moderation.ts is the implementation — its internal calls are the checkers calling each
  // other, not a user-facing rejection, and it has no request context to attribute one to.
  const NOT_A_CALL_SITE = new Set(['moderation.ts', 'moderation-metrics.ts']);

  // Call sites live wherever Phase 3 has moved them into apps/api/src/<bucket>/, not
  // necessarily beside this test -- scan the whole source tree, not just `here`.
  const apiSrcRoot = resolve(here, '..');
  const callSites = readdirSync(apiSrcRoot, { recursive: true })
    .filter((name): name is string => typeof name === 'string')
    .filter((name) => !name.startsWith('store' + sep) && !name.startsWith('__tests__' + sep))
    .map((name) => name.split(sep).join('/'))
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && !NOT_A_CALL_SITE.has(basename(name)))
    .filter((name) => MODERATES.test(readFileSync(resolve(apiSrcRoot, name), 'utf8')));

  it('finds the call sites it means to check', () => {
    // Without this the suite below passes vacuously the moment the pattern stops matching
    // — for instance if the checker is ever renamed or wrapped.
    expect(callSites.sort()).toEqual([
      'agent-surface/mcp-round-reopen-tools.ts',
      'community/player-feedback.ts',
      'community/proposals.ts',
      'creation/create-game.ts',
      'creation/creator-feedback-handler.ts',
      'creation/editor-drafts.ts',
      'creation/improve-routes.ts',
      'creation/refine.ts',
      'creation/remix.ts',
      'notifications/contact.ts',
      'realtime/worlds.ts',
    ]);
  });

  it.each(callSites)('%s calls logModerationRejection', (name) => {
    expect(readFileSync(resolve(apiSrcRoot, name), 'utf8')).toContain('logModerationRejection(');
  });

  it.each(callSites)('%s sends a category the client can actually look up', (name) => {
    // `category` is optional on a verdict, and JSON drops an undefined value rather than
    // sending null — so a checker that refuses without classifying produces a 422 with no
    // category field at all, and the client's `errors.contentRejected.<category>` lookup
    // resolves to nothing. Every route normalized this except the worlds one, which is the
    // shape of defect that survives precisely because five siblings are correct.
    //
    // Whitespace is collapsed first so the assertion does not depend on how prettier
    // happens to wrap a long line.
    const normalized = readFileSync(resolve(apiSrcRoot, name), 'utf8').replace(/\s+/g, ' ');
    const sendArguments = normalized
      .split('.send(')
      .slice(1)
      .map((fragment) => fragment.slice(0, 200));
    for (const argument of sendArguments) {
      if (argument.includes('category:')) {
        expect(argument).toContain("?? 'other'");
      }
    }
  });

  it.each(callSites)('%s reports once per rejection branch', (name) => {
    // A module can moderate several surfaces (submissions moderates specs and two flavours
    // of feedback). Counting the 422s against the log calls catches the half-wired case:
    // one surface reporting, its sibling silently not.
    const source = readFileSync(resolve(apiSrcRoot, name), 'utf8');
    const rejections = source.match(/if \(!(?:moderation|verdict)\.allowed\)/g)?.length ?? 0;
    const reports = source.match(/logModerationRejection\(/g)?.length ?? 0;
    expect(rejections).toBeGreaterThan(0);
    expect(reports).toBe(rejections);
  });
});

describe('the alert that reads these logs', () => {
  const script = readFileSync(resolve(here, '../../../../infra/setup-monitoring.sh'), 'utf8');

  it('filters on the message this module emits', () => {
    // The other half of the two-file contract. The metric is worthless if the filter and the
    // log line disagree, and nothing else in the system would notice: a filter matching zero
    // entries produces a metric that is always zero, which reads exactly like "no abuse".
    expect(script).toContain(MODERATION_REJECTED_MSG);
    expect(script).toContain('moderation_rejections');
  });

  it('is scoped to the app service rather than the whole project', () => {
    // The relay and the zone host run the same image. Neither moderates anything, but a
    // project-wide filter would silently include them, and a filter whose scope is wider
    // than its meaning is how a metric starts counting something else.
    expect(script).toMatch(/moderation_rejections[\s\S]{0,600}resource\.labels\.service_name/);
  });

  it('scopes the alert policy too, not only the metric behind it', () => {
    // Asserted separately because the metric is editable in the Console: widening its
    // filter would turn A14 project-wide without this file changing. The policy carrying
    // its own service constraint means the blast radius of that edit is bounded.
    const policy = script.slice(script.indexOf('A14 moderation rejection burst'));
    expect(policy).toContain('logging.googleapis.com/user/moderation_rejections');
    expect(policy.slice(0, 800)).toContain('service_name');
  });
});

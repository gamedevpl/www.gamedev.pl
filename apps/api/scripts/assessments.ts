// Assessment desk reviews from the terminal; usage in game-assessment-plan.md.

// Same Firestore-with-gcloud-credentials path as beta:approve and token:mint.

// Shares prepareResolution + applyResolution with the admin route.

// Writes to whatever project your credentials point at.

import { ASSESSMENT_RESOLUTION_STATUSES, type AssessmentResolutionStatus } from '@gamedevpl/contract';
import {
  cliActor,
  filterAssessments,
  flagValue,
  formatAssessmentLine,
  formatResolutionLine,
  hasFlag,
  resolveTarget,
} from '../src/community/assessment-cli.js';
import { applyResolution, prepareResolution, summarizeResolutions } from '../src/community/assessment-resolution.js';
import { FirestoreStore } from '../src/store.js';

function usage(): never {
  console.error(
    [
      'Usage:',
      '  assess:list      -- [--slug <slug>] [--reviewer <uid>] [--verdict keep|cut|skip]',
      '                      [--open | --resolved] [--limit N] [--json]',
      '  assess:show      -- <slug> [--reviewer <uid> | --id <slug:reviewerUid>] [--json]',
      `  assess:resolve   -- <slug> [--reviewer <uid> | --id <slug:reviewerUid>]`,
      `                      --status ${ASSESSMENT_RESOLUTION_STATUSES.join('|')} --comment <text>`,
      '                      [--link <url>] [--dry-run]',
      '  assess:unresolve -- <slug> [--reviewer <uid> | --id <slug:reviewerUid>] [--dry-run]',
      '',
      '--id is the `id` field from assess:list/show --json (`<slug>:<reviewerUid>`) —',
      'paste one straight back in instead of splitting it into --reviewer yourself.',
    ].join('\n'),
  );
  process.exit(1);
}

async function list(store: FirestoreStore, args: string[]): Promise<void> {
  const slug = flagValue(args, '--slug');
  const reviewer = flagValue(args, '--reviewer');
  const verdict = flagValue(args, '--verdict');
  const limitRaw = flagValue(args, '--limit');
  const limit = limitRaw ? Number(limitRaw) : 50;
  if (!Number.isInteger(limit) || limit < 1) {
    console.error(`--limit must be a positive integer, got "${limitRaw}"`);
    process.exit(1);
  }

  const all = slug ? await store.listGameAssessmentsBySlug(slug) : await store.listGameAssessments();
  const rows = filterAssessments(all, {
    reviewerUid: reviewer,
    verdict,
    onlyOpen: hasFlag(args, '--open'),
    onlyResolved: hasFlag(args, '--resolved'),
  });

  if (hasFlag(args, '--json')) {
    console.log(JSON.stringify(rows.slice(0, limit), null, 2));
    return;
  }

  const totals = summarizeResolutions(rows);
  if (rows.length === 0) {
    console.log('No assessments match that filter.');
    return;
  }
  for (const row of rows.slice(0, limit)) console.log(formatAssessmentLine(row));
  if (rows.length > limit) console.log(`… ${rows.length - limit} more (raise --limit)`);
  console.log('');
  console.log(`${rows.length} assessment(s): ${totals.resolved} resolved, ${totals.open} open.`);
}

async function show(store: FirestoreStore, args: string[]): Promise<void> {
  const target = resolveTarget(args);
  if ('error' in target) {
    console.error(target.error);
    usage();
  }
  const { slug, reviewerUid } = target;

  const all = await store.listGameAssessmentsBySlug(slug);
  const rows = reviewerUid ? all.filter((row) => row.reviewerUid === reviewerUid) : all;
  if (rows.length === 0) {
    console.log(`No assessments for ${reviewerUid ? `${slug}:${reviewerUid}` : slug}.`);
    process.exit(1);
  }
  if (hasFlag(args, '--json')) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  const totals = summarizeResolutions(rows);
  console.log(`${slug} — ${rows.length} assessment(s), ${totals.resolved} resolved, ${totals.open} open`);
  for (const row of rows) {
    console.log('');
    console.log(
      `  ${row.verdict.toUpperCase().padEnd(4)} by ${row.reviewerUid}  (${row.updatedAt.slice(0, 19).replace('T', ' ')} UTC)`,
    );
    if (row.checklist) {
      console.log(
        `    checklist: ${Object.entries(row.checklist)
          .map(([key, mark]) => `${key}=${mark}`)
          .join(' ')}`,
      );
    }
    if (row.gameVersion) console.log(`    version:   ${row.gameVersion}`);
    console.log(`    note:      ${row.note}`);
    console.log(`    follow-up: ${formatResolutionLine(row)}`);
    if (row.resolution) {
      console.log(`               by ${row.resolution.resolvedBy} on ${row.resolution.resolvedAt.slice(0, 10)}`);
    }

    const history = await store.listGameAssessmentHistory(slug, row.reviewerUid);
    for (const past of history) {
      console.log(`    earlier:   ${past.verdict} — ${past.note} (superseded ${past.supersededAt.slice(0, 10)})`);
    }
  }
}

async function write(store: FirestoreStore, args: string[], status: AssessmentResolutionStatus | null): Promise<void> {
  const target = resolveTarget(args);
  if ('error' in target) {
    console.error(target.error);
    usage();
  }
  const { slug, reviewerUid } = target;

  const prepared = prepareResolution(
    { status, comment: flagValue(args, '--comment'), link: flagValue(args, '--link') },
    cliActor(process.env.USER),
    Date.now(),
  );
  if (!prepared.ok) {
    console.error(`Refused: ${prepared.error}`);
    process.exit(1);
  }

  const targets = reviewerUid ? [reviewerUid] : (await store.listGameAssessmentsBySlug(slug)).map((r) => r.reviewerUid);
  if (targets.length === 0) {
    console.error(`No assessments for ${slug}.`);
    process.exit(1);
  }

  if (hasFlag(args, '--dry-run')) {
    const verb = status === null ? 'clear the follow-up on' : `mark ${status} on`;
    console.log(`[dry-run] would ${verb} ${targets.length} row(s) for ${slug}: ${targets.join(', ')}`);
    if (prepared.resolution) console.log(`[dry-run] comment: ${prepared.resolution.comment}`);
    return;
  }

  const { updated, stale, missing } = await applyResolution(store, { slug, reviewerUid }, prepared.resolution);
  for (const row of updated) {
    console.log(`${status === null ? 'Cleared' : `Marked ${status}`}: ${row.slug} · ${row.reviewerUid}`);
  }
  // The row now judges a different build than this comment answers.
  for (const uid of stale) console.error(`Skipped ${uid}: re-assessed since this run started — re-read and retry.`);
  if (missing > 0) console.error(`Skipped ${missing} row(s): no assessment for that reviewer.`);
  if (updated.length === 0) process.exit(1);
}

async function main() {
  const [action, ...args] = process.argv.slice(2);
  const store = new FirestoreStore();

  if (action === 'list') return await list(store, args);
  if (action === 'show') return await show(store, args);
  if (action === 'unresolve') return await write(store, args, null);
  if (action === 'resolve') {
    const status = flagValue(args, '--status');
    if (!status || !ASSESSMENT_RESOLUTION_STATUSES.includes(status as AssessmentResolutionStatus)) {
      console.error(`--status must be one of ${ASSESSMENT_RESOLUTION_STATUSES.join(', ')}`);
      process.exit(1);
    }
    return await write(store, args, status as AssessmentResolutionStatus);
  }
  usage();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

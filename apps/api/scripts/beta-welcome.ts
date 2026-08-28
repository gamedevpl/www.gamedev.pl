import { Firestore } from '@google-cloud/firestore';
import type { Locale } from '@gamedevpl/contract';
import type { WaitlistEntry } from '../src/platform/store.js';
import { ConsoleMailer, createMailerFromEnv } from '../src/notifications/mailer.js';
import { normalizeLocale } from '../src/notifications/email-templates.js';
import {
  BETA_WELCOME_FROM,
  BETA_WELCOME_REPLY_TO,
  BETA_WELCOME_SITE_URL,
  betaWelcomeMessage,
  guessWelcomeLocale,
  parseWelcomeStatuses,
  pickWelcomeRecipients,
  runWelcomeDelivery,
  welcomeGivenName,
  welcomeNeedsApprove,
  welcomeSendBlockedReason,
  type WelcomeCandidate,
} from '../src/notifications/beta-welcome-email.js';

function usage(code = 1): never {
  console.error(`Usage: npm run beta:welcome -w @gamedevpl/api -- [options]

Preview waitlist welcome mail (default). Pass --send only when you really mean it.

  --status pending|approved|all   default: pending
  --only <email>                  one recipient
  --limit <n>                     cap after filters
  --locale en|pl                  force language
  --from <rfc5322>                default: Grzegorz <noreply@mail.gamedev.pl>
  --approve                       mark pending as approved when sending
  --force                         resend even if welcomeEmailedAt is set
  --send                          actually send (refuses without RESEND_API_KEY)
  --delay-ms <n>                  pause between real sends (default 600)
`);
  process.exit(code);
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function flagValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const next = args[index + 1];
  if (!next || next.startsWith('--')) usage();
  return next;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asCandidate(id: string, data: Partial<WaitlistEntry>): WelcomeCandidate | null {
  const email = data.email?.trim();
  if (!email) return null;
  return {
    uid: id,
    email,
    name: data.name,
    locale: data.locale,
    status: data.status ?? 'pending',
    requestedAt: data.requestedAt,
    welcomeEmailedAt: data.welcomeEmailedAt,
  };
}

async function approveAndVerify(db: Firestore, uid: string, email: string): Promise<void> {
  const ref = db.collection('waitlist').doc(uid);
  await ref.set({ status: 'approved' }, { merge: true });
  const snap = await ref.get();
  if (snap.data()?.status !== 'approved') {
    throw new Error(`failed to approve ${email}: waitlist status is ${String(snap.data()?.status ?? 'missing')}`);
  }
}

function sampleFor(locale: 'en' | 'pl', rows: readonly { locale: 'en' | 'pl'; text: string; subject: string }[]) {
  return rows.find((row) => row.locale === locale);
}

async function main() {
  const args = process.argv.slice(2);
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) usage(0);

  const send = hasFlag(args, '--send');
  const approve = hasFlag(args, '--approve');
  const force = hasFlag(args, '--force');
  const only = flagValue(args, '--only');
  const limitRaw = flagValue(args, '--limit');
  const delayRaw = flagValue(args, '--delay-ms');
  const from = flagValue(args, '--from') || process.env.BETA_WELCOME_FROM?.trim() || BETA_WELCOME_FROM;
  const siteUrl = process.env.INVITE_URL?.trim() || BETA_WELCOME_SITE_URL;
  const replyEmail = process.env.BETA_WELCOME_REPLY_TO?.trim() || BETA_WELCOME_REPLY_TO;
  const forcedLocaleRaw = flagValue(args, '--locale');
  const statuses = parseWelcomeStatuses(flagValue(args, '--status') ?? 'pending');
  const limit = limitRaw === undefined ? undefined : Number(limitRaw);
  const delayMs = delayRaw === undefined ? 600 : Number(delayRaw);
  if (limitRaw !== undefined && (!Number.isFinite(limit) || (limit ?? 0) < 0)) usage();
  if (!Number.isFinite(delayMs) || delayMs < 0) usage();

  const db = new Firestore({ projectId: 'gamedevpl' });
  const snap = await db.collection('waitlist').get();
  const entries: WelcomeCandidate[] = [];
  let noEmail = 0;
  for (const doc of snap.docs) {
    const row = asCandidate(doc.id, doc.data() as WaitlistEntry);
    if (!row) {
      noEmail += 1;
      continue;
    }
    entries.push(row);
  }

  const recipients = pickWelcomeRecipients(entries, { statuses, only, force, limit });
  const blocked = welcomeSendBlockedReason({ send, approve, recipients });
  if (blocked) {
    console.error(blocked);
    process.exit(1);
  }

  const mailer = send ? createMailerFromEnv({ ...process.env, MAIL_FROM: from }) : new ConsoleMailer(() => undefined);
  if (send && mailer.name === 'console') {
    console.error(
      'RESEND_API_KEY is not set — refusing to send.\n' +
        'Export the key (see docs/deployment.md) or omit --send to preview.',
    );
    process.exit(1);
  }

  const rendered = recipients.map((row) => {
    const locale: Locale = forcedLocaleRaw ? normalizeLocale(forcedLocaleRaw) : guessWelcomeLocale(row);
    const message = betaWelcomeMessage(
      row.email,
      locale,
      { givenName: welcomeGivenName(row.name), siteUrl, replyEmail },
      from,
    );
    return { row, locale, message };
  });

  const plCount = rendered.filter((item) => item.locale === 'pl').length;
  const enCount = rendered.filter((item) => item.locale === 'en').length;
  const verb = send ? 'Emailing' : 'Would email';
  console.log(
    `${verb} ${rendered.length} people (${plCount} pl, ${enCount} en). ` +
      `Waitlist docs: ${snap.size}. Skipped without email: ${noEmail}. ` +
      (send ? 'Sending for real.' : 'Dry-run: no mail and no Firestore writes.'),
  );

  for (const item of rendered) {
    const mark = send ? (approve && item.row.status === 'pending' ? 'send+approve' : 'send') : 'preview';
    console.log(
      `  ${mark.padEnd(13)} ${item.locale}  ${item.row.status.padEnd(9)} ${item.row.email}  ${item.row.name ?? ''}`.trimEnd(),
    );
  }

  const samples = rendered.map((item) => ({
    locale: item.locale,
    subject: item.message.subject,
    text: item.message.text,
  }));
  for (const locale of ['pl', 'en'] as const) {
    const sample = sampleFor(locale, samples);
    if (!sample) continue;
    console.log(`\n--- sample ${locale}: ${sample.subject} ---\n${sample.text}\n`);
  }

  if (!send) return;

  for (const [index, item] of rendered.entries()) {
    const shouldApprove = welcomeNeedsApprove(approve, item.row.status);
    const result = await runWelcomeDelivery({
      shouldApprove,
      approve: () => approveAndVerify(db, item.row.uid, item.row.email),
      send: () => mailer.send(item.message),
      stamp: () =>
        db
          .collection('waitlist')
          .doc(item.row.uid)
          .set({ welcomeEmailedAt: new Date().toISOString() }, { merge: true }),
    });
    console.log(
      `✉️  ${item.row.email} via ${result.provider}${result.id ? ` (${result.id})` : ''}` +
        `${shouldApprove ? ' — approved' : ''}`,
    );
    if (index < rendered.length - 1 && delayMs > 0) await sleep(delayMs);
  }
}

main().catch((err) => {
  console.error('Error preparing welcome mail:', err);
  process.exit(1);
});

// beta:invite — pre-approve an email for the closed beta AND send them the
// invitation. This is `beta:approve` (which only flips Firestore status) plus an
// email, so a colleague/friend gets a link instead of having to discover the
// site and join the waitlist first.
//
//   npm run beta:invite -- friend@example.com
//   npm run beta:invite -- friend@example.com --locale pl
//   npm run beta:invite -- friend@example.com --dry-run   # preview, no send, no write
//
// Sending requires RESEND_API_KEY in the environment (see docs/deployment.md).
// Without it, the command refuses rather than silently not sending — use
// --dry-run to preview the email and the approval it would make.

import { Firestore } from '@google-cloud/firestore';
import type { WaitlistEntry } from '../src/platform/store.js';
import { createMailerFromEnv, ConsoleMailer } from '../src/notifications/mailer.js';
import { betaInviteMessage, normalizeLocale } from '../src/notifications/email-templates.js';

function usage(): never {
  console.error('Usage: npm run beta:invite -- <email> [--locale en|pl] [--dry-run]');
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith('--'));
  if (!email || !email.includes('@')) usage();

  const dryRun = args.includes('--dry-run');
  const localeArg = args[args.indexOf('--locale') + 1];
  const locale = normalizeLocale(args.includes('--locale') ? localeArg : undefined);
  const emailLower = email.toLowerCase();
  const inviteUrl = process.env.INVITE_URL?.trim() || 'https://www.gamedev.pl';

  // Choose the mailer up front so we can fail fast before writing anything if a
  // real send was requested but no provider is configured.
  const mailer = dryRun ? new ConsoleMailer() : createMailerFromEnv();
  if (!dryRun && mailer.name === 'console') {
    console.error(
      'RESEND_API_KEY is not set — refusing to "invite" without actually sending.\n' +
        'Set RESEND_API_KEY (see docs/deployment.md) or pass --dry-run to preview.',
    );
    process.exit(1);
  }

  const message = betaInviteMessage(emailLower, locale, { inviteUrl });

  if (dryRun) {
    console.log(`[dry-run] would approve ${emailLower} and send:`);
    await mailer.send(message);
    console.log('[dry-run] no Firestore write and no email were made.');
    return;
  }

  // 1) Pre-approve in Firestore (idempotent), mirroring beta-approve's email path.
  const db = new Firestore({ projectId: 'gamedevpl' });
  const waitlistRef = db.collection('waitlist');
  const existing = await waitlistRef.where('email', '==', emailLower).limit(1).get();

  if (existing.empty) {
    const uid = `email:${emailLower}`;
    const entry: Partial<WaitlistEntry> = {
      uid,
      email: emailLower,
      requestedAt: new Date().toISOString(),
      locale,
      status: 'approved',
    };
    await waitlistRef.doc(uid).set(entry);
    console.log(`✅ Pre-approved new entry ${uid} (${emailLower})`);
  } else {
    await existing.docs[0].ref.update({ status: 'approved' });
    console.log(`✅ Approved existing entry ${existing.docs[0].id} (${emailLower})`);
  }

  // 2) Send the invitation.
  const result = await mailer.send(message);
  console.log(`✉️  Invitation sent to ${emailLower} via ${result.provider}${result.id ? ` (${result.id})` : ''}`);
}

main().catch((err) => {
  console.error('Error sending invite:', err);
  process.exit(1);
});

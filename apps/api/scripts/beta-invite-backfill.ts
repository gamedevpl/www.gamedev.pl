// beta:invite:backfill — claimed invites → approved rows. See docs/deployment.md.

import { Firestore } from '@google-cloud/firestore';
import type { BetaInvite, User, WaitlistEntry } from '../src/platform/store.js';

async function main() {
  const apply = process.argv.slice(2).includes('--apply');
  const db = new Firestore({ projectId: 'gamedevpl' });

  const invites = await db.collection('betaInvites').where('status', '==', 'claimed').get();
  if (invites.empty) {
    console.log('No claimed invites found.');
    return;
  }

  // Dedupe so the report counts people, not invites.
  const claimants = new Map<string, BetaInvite>();
  for (const doc of invites.docs) {
    const invite = doc.data() as BetaInvite;
    if (invite.claimedUid) claimants.set(invite.claimedUid, invite);
  }

  let approved = 0;
  let alreadyApproved = 0;

  for (const [uid, invite] of claimants) {
    const waitlistRef = db.collection('waitlist').doc(uid);
    const [waitlistSnap, userSnap] = await Promise.all([waitlistRef.get(), db.collection('users').doc(uid).get()]);
    const existing = waitlistSnap.exists ? (waitlistSnap.data() as WaitlistEntry) : null;

    if (existing?.status === 'approved') {
      alreadyApproved += 1;
      console.log(`•  ${uid} — already approved, skipping`);
      continue;
    }

    const user = userSnap.exists ? (userSnap.data() as User) : null;
    const record: WaitlistEntry = {
      uid,
      requestedAt: existing?.requestedAt ?? invite.claimedAt ?? invite.createdAt,
      status: 'approved',
    };
    const email = (user?.email ?? existing?.email)?.toLowerCase();
    if (email) record.email = email;
    const name = user?.name ?? existing?.name;
    if (name) record.name = name;
    const locale = user?.locale ?? existing?.locale;
    if (locale) record.locale = locale;

    approved += 1;
    const label = `${uid}${email ? ` (${email})` : ''}`;
    if (!apply) {
      console.log(`?  ${label} — would approve (invite ${invite.id})`);
      continue;
    }
    await waitlistRef.set(record, { merge: true });
    console.log(`✅ ${label} — approved (invite ${invite.id})`);
  }

  console.log(
    `\n${claimants.size} claimed invite(s): ${alreadyApproved} already approved, ` +
      `${approved} ${apply ? 'approved' : 'to approve — re-run with --apply'}.`,
  );
}

main().catch((err) => {
  console.error('Error backfilling invite claims:', err);
  process.exit(1);
});

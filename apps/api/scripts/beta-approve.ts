import { Firestore } from '@google-cloud/firestore';
import type { WaitlistEntry } from '../src/platform/store.js';

async function main() {
  const args = process.argv.slice(2);
  const identifier = args.find((a) => !a.startsWith('--'));

  if (!identifier) {
    console.error('Usage: npm run beta:approve -- <email-or-uid> [--reject | --pending]');
    process.exit(1);
  }

  const targetStatus = args.includes('--reject') ? 'rejected' : args.includes('--pending') ? 'pending' : 'approved';

  const db = new Firestore({ projectId: 'gamedevpl' });
  const waitlistRef = db.collection('waitlist');

  let docRef;
  let data: Partial<WaitlistEntry> | undefined;

  // Check if identifier is a UID (starts with g:)
  if (identifier.startsWith('g:')) {
    docRef = waitlistRef.doc(identifier);
    const snap = await docRef.get();
    if (snap.exists) {
      data = snap.data() as WaitlistEntry;
    } else {
      console.log(`No waitlist entry found for UID ${identifier}. Creating new entry.`);
      const now = new Date().toISOString();
      await docRef.set({
        uid: identifier,
        requestedAt: now,
        status: targetStatus,
      });
      console.log(`✅ Granted closed beta access (${targetStatus}) to UID: ${identifier}`);
      return;
    }
  } else {
    // Treat as email address
    const emailLower = identifier.toLowerCase();
    const querySnap = await waitlistRef.where('email', '==', emailLower).get();

    if (querySnap.empty) {
      const now = new Date().toISOString();
      const newUid = `email:${emailLower}`;
      docRef = waitlistRef.doc(newUid);
      data = {
        uid: newUid,
        email: emailLower,
        requestedAt: now,
        status: targetStatus,
      };
      await docRef.set(data);
      console.log(`✅ Created new waitlist entry and set status to "${targetStatus}" for:`);
      console.log(`   UID:   ${newUid}`);
      console.log(`   Email: ${emailLower}`);
      return;
    }

    docRef = querySnap.docs[0].ref;
    data = querySnap.docs[0].data() as WaitlistEntry;
  }

  await docRef.update({ status: targetStatus });
  console.log(`✅ Updated waitlist status to "${targetStatus}" for:`);
  console.log(`   UID:   ${data?.uid ?? identifier}`);
  console.log(`   Email: ${data?.email ?? '(none)'}`);
  console.log(`   Name:  ${data?.name ?? '(none)'}`);
}

main().catch((err) => {
  console.error('Error approving user:', err);
  process.exit(1);
});

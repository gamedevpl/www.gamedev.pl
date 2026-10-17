import type { Firestore } from '@google-cloud/firestore';
import type { SubmissionRecord } from '../records/submission.js';
import { assertAgentRound } from './agent-round-write.js';

// What managed builders learned about one creator, any vendor, any game.
export interface CreatorNotesRecord {
  uid: string;
  text: string;
  updatedAt: string;
  jobId: number;
  roundGeneration: number;
}

export const MAX_CREATOR_NOTES_CHARS = 4000;

export interface CreatorNotesStore {
  getCreatorNotes(uid: string): Promise<CreatorNotesRecord | null>;
  // Replaces the notes; only the job owner's current round.
  setCreatorNotes(record: CreatorNotesRecord): Promise<void>;
}

// Throws like the round-budget writes when the round moved on.
function assertWriter(sub: SubmissionRecord | undefined, record: CreatorNotesRecord): void {
  assertAgentRound(sub, record.roundGeneration);
  if (sub?.ownerUid !== record.uid) {
    throw Object.assign(new Error('this round belongs to another creator'), { statusCode: 409 });
  }
}

export class InMemoryCreatorNotesStore implements CreatorNotesStore {
  notes = new Map<string, CreatorNotesRecord>();

  constructor(private getSubmission: (jobId: number) => SubmissionRecord | undefined = () => undefined) {}

  async getCreatorNotes(uid: string): Promise<CreatorNotesRecord | null> {
    const record = this.notes.get(uid);
    return record ? { ...record } : null;
  }

  async setCreatorNotes(record: CreatorNotesRecord): Promise<void> {
    assertWriter(this.getSubmission(record.jobId), record);
    this.notes.set(record.uid, { ...record });
  }
}

export class FirestoreCreatorNotesStore implements CreatorNotesStore {
  constructor(private db: Firestore) {}

  private doc(uid: string) {
    return this.db.collection('creatorNotes').doc(uid);
  }

  async getCreatorNotes(uid: string): Promise<CreatorNotesRecord | null> {
    const snap = await this.doc(uid).get();
    return snap.exists ? (snap.data() as CreatorNotesRecord) : null;
  }

  async setCreatorNotes(record: CreatorNotesRecord): Promise<void> {
    const jobRef = this.db.collection('submissions').doc(String(record.jobId));
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(jobRef);
      assertWriter(snap.exists ? (snap.data() as SubmissionRecord) : undefined, record);
      tx.set(this.doc(record.uid), record);
    });
  }
}

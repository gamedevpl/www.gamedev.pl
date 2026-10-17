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
  // Bumped on every write; a writer names the revision it read.
  revision: number;
}

export const MAX_CREATOR_NOTES_CHARS = 4000;

export interface CreatorNotesStore {
  getCreatorNotes(uid: string): Promise<CreatorNotesRecord | null>;
  // Replaces the notes read at `basedOn`; returns the new revision.
  setCreatorNotes(record: Omit<CreatorNotesRecord, 'revision'>, basedOn: number): Promise<number>;
}

export class CreatorNotesConflict extends Error {
  constructor(readonly current: CreatorNotesRecord | null) {
    super('the creator notes changed since they were read');
  }
}

// Throws like the round-budget writes when the round moved on.
function assertWriter(
  sub: SubmissionRecord | undefined,
  record: Omit<CreatorNotesRecord, 'revision'>,
  current: CreatorNotesRecord | null,
  basedOn: number,
): number {
  assertAgentRound(sub, record.roundGeneration);
  if (sub?.ownerUid !== record.uid) {
    throw Object.assign(new Error('this round belongs to another creator'), { statusCode: 409 });
  }
  // Two rounds of one creator must not overwrite each other blind.
  if ((current?.revision ?? 0) !== basedOn) throw new CreatorNotesConflict(current);
  return basedOn + 1;
}

export class InMemoryCreatorNotesStore implements CreatorNotesStore {
  notes = new Map<string, CreatorNotesRecord>();

  constructor(private getSubmission: (jobId: number) => SubmissionRecord | undefined = () => undefined) {}

  async getCreatorNotes(uid: string): Promise<CreatorNotesRecord | null> {
    const record = this.notes.get(uid);
    return record ? { ...record } : null;
  }

  async setCreatorNotes(record: Omit<CreatorNotesRecord, 'revision'>, basedOn: number): Promise<number> {
    const current = this.notes.get(record.uid) ?? null;
    const revision = assertWriter(this.getSubmission(record.jobId), record, current, basedOn);
    this.notes.set(record.uid, { ...record, revision });
    return revision;
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

  async setCreatorNotes(record: Omit<CreatorNotesRecord, 'revision'>, basedOn: number): Promise<number> {
    const jobRef = this.db.collection('submissions').doc(String(record.jobId));
    const notesRef = this.doc(record.uid);
    return this.db.runTransaction(async (tx) => {
      const [jobSnap, notesSnap] = await Promise.all([tx.get(jobRef), tx.get(notesRef)]);
      const sub = jobSnap.exists ? (jobSnap.data() as SubmissionRecord) : undefined;
      const current = notesSnap.exists ? (notesSnap.data() as CreatorNotesRecord) : null;
      const revision = assertWriter(sub, record, current, basedOn);
      tx.set(notesRef, { ...record, revision });
      return revision;
    });
  }
}

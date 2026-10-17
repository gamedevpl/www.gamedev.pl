import type { Firestore } from '@google-cloud/firestore';
import type { SubmissionRecord } from '../records/submission.js';
import { assertAgentRound } from './agent-round-write.js';

// Notes one game's builders leave for the next round, any vendor.
export interface BuilderNotesRecord {
  slug: string;
  text: string;
  updatedAt: string;
  jobId: number;
  roundGeneration: number;
}

export const MAX_BUILDER_NOTES_CHARS = 4000;

export interface BuilderNotesStore {
  getBuilderNotes(slug: string): Promise<BuilderNotesRecord | null>;
  // Replaces the notes; only the job's current round, own slug.
  setBuilderNotes(record: BuilderNotesRecord): Promise<void>;
  clearBuilderNotes(slug: string): Promise<void>;
}

// Throws like the round-budget writes when the round moved on.
function assertWriter(sub: SubmissionRecord | undefined, record: BuilderNotesRecord): void {
  assertAgentRound(sub, record.roundGeneration);
  if (sub?.slug !== record.slug) {
    throw Object.assign(new Error('this round builds a different game'), { statusCode: 409 });
  }
}

export class InMemoryBuilderNotesStore implements BuilderNotesStore {
  notes = new Map<string, BuilderNotesRecord>();

  constructor(private getSubmission: (jobId: number) => SubmissionRecord | undefined = () => undefined) {}

  async getBuilderNotes(slug: string): Promise<BuilderNotesRecord | null> {
    const record = this.notes.get(slug);
    return record ? { ...record } : null;
  }

  async setBuilderNotes(record: BuilderNotesRecord): Promise<void> {
    assertWriter(this.getSubmission(record.jobId), record);
    this.notes.set(record.slug, { ...record });
  }

  async clearBuilderNotes(slug: string): Promise<void> {
    this.notes.delete(slug);
  }
}

export class FirestoreBuilderNotesStore implements BuilderNotesStore {
  constructor(private db: Firestore) {}

  private doc(slug: string) {
    return this.db.collection('gameBuilderNotes').doc(slug);
  }

  async getBuilderNotes(slug: string): Promise<BuilderNotesRecord | null> {
    const snap = await this.doc(slug).get();
    return snap.exists ? (snap.data() as BuilderNotesRecord) : null;
  }

  async setBuilderNotes(record: BuilderNotesRecord): Promise<void> {
    const jobRef = this.db.collection('submissions').doc(String(record.jobId));
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(jobRef);
      assertWriter(snap.exists ? (snap.data() as SubmissionRecord) : undefined, record);
      tx.set(this.doc(record.slug), record);
    });
  }

  async clearBuilderNotes(slug: string): Promise<void> {
    await this.doc(slug).delete();
  }
}

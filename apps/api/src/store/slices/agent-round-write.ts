import { FieldValue } from '@google-cloud/firestore';
import type { DocumentReference } from '@google-cloud/firestore';
import type { GuardedFirestore } from '../shelf-guard-firestore.js';
import type { SubmissionRecord } from '../records/submission.js';

export type AgentSignalOptions = { preserveEnded?: boolean; roundGeneration?: number };

export function assertAgentRound(record: SubmissionRecord | undefined, generation?: number): void {
  if (generation !== undefined && (!record || (record.roundGeneration ?? 1) !== generation)) {
    throw Object.assign(new Error('this agent session is no longer current'), { statusCode: 401 });
  }
}

type Write = { ref: DocumentReference; data: Record<string, unknown>; merge?: true };
export async function writeAgentRoundDocuments(
  db: GuardedFirestore,
  jobId: number,
  generation: number | undefined,
  writes: Write[],
): Promise<void> {
  if (generation === undefined) {
    for (const write of writes) {
      if (write.merge) await write.ref.set(write.data, { merge: true });
      else await write.ref.set(write.data);
    }
    return;
  }
  await db.runTransaction(async (tx) => {
    const parent = await tx.get(db.collection('submissions').doc(String(jobId)));
    assertAgentRound(parent.exists ? (parent.data() as SubmissionRecord) : undefined, generation);
    for (const write of writes) {
      if (write.merge) tx.set(write.ref, write.data, { merge: true });
      else tx.set(write.ref, write.data);
    }
  });
}

export function agentSignalFields(
  at: string,
  options?: AgentSignalOptions,
  presence?: { key: string },
  clearPresence = false,
): Record<string, unknown> {
  return {
    lastAgentSignalAt: at,
    ...(clearPresence ? { lastAgentPresence: FieldValue.delete() } : {}),
    ...(presence ? { lastAgentPresence: { key: presence.key, at } } : {}),
    ...(options?.preserveEnded ? {} : { agentEndedAt: FieldValue.delete(), agentEndedBy: FieldValue.delete() }),
  };
}
export async function writeAgentRoundVersion(
  db: GuardedFirestore,
  jobId: number,
  version: string,
  generation?: number,
  publish = false,
): Promise<void> {
  await writeAgentRoundDocuments(db, jobId, generation, [
    {
      ref: db.collection('submissions').doc(String(jobId)),
      merge: true,
      data: { previewVersion: version, ...(publish ? { deliveredVersion: version } : {}) },
    },
  ]);
}

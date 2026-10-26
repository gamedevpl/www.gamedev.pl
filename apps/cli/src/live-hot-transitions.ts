import * as z from 'zod';

const revision = z.string().regex(/^[a-f0-9]{64}$/);
const sequence = z.number().int().nonnegative();
export const hotTransitionMessage = z.discriminatedUnion('phase', [
  z
    .object({
      type: z.literal('live:hot'),
      phase: z.literal('begin'),
      id: z.string().uuid(),
      sourceId: sequence,
      previousRevision: revision,
      revision,
      expectedEpoch: sequence,
    })
    .strict(),
  z
    .object({
      type: z.literal('live:hot'),
      phase: z.literal('finish'),
      id: z.string().uuid(),
      result: z.enum(['applied', 'failed', 'rejected']),
      epoch: sequence,
      runtimeInstanceId: z.string().uuid(),
      previousRecordingId: z.string().uuid(),
      recordingId: z.string().uuid(),
      frame: sequence,
      simulationTick: sequence,
    })
    .strict(),
  z.object({ type: z.literal('live:hot'), phase: z.enum(['status', 'abort']), id: z.string().uuid() }).strict(),
]);
type Begin = Extract<z.infer<typeof hotTransitionMessage>, { phase: 'begin' }>;
type Finish = Extract<z.infer<typeof hotTransitionMessage>, { phase: 'finish' }>;
type Transaction = Begin & { state: 'prepared' | 'committed' | 'aborted'; result?: Finish };

export function hotTransitions() {
  const transactions = new Map<string, Transaction>();
  return {
    get: (id: string) => transactions.get(id),
    pending: () => [...transactions.values()].find((transaction) => transaction.state === 'prepared'),
    begin(message: Begin) {
      const existing = transactions.get(message.id);
      if (existing) {
        if (
          JSON.stringify({ ...existing, state: undefined, result: undefined }) !==
          JSON.stringify({ ...message, state: undefined, result: undefined })
        )
          throw Error('Update ID belongs to another transaction.');
        return existing;
      }
      if (transactions.size >= 256) throw Error('Update history capacity reached; restart Play to continue.');
      const transaction: Transaction = { ...message, state: 'prepared' };
      transactions.set(message.id, transaction);
      return transaction;
    },
    finish(transaction: Transaction, result: Finish) {
      if (transaction.state !== 'prepared') return transaction;
      const committed = result.result !== 'rejected';
      if (result.epoch !== transaction.expectedEpoch + (committed ? 1 : 0)) throw Error('Unexpected update epoch.');
      transaction.state = committed ? 'committed' : 'aborted';
      transaction.result = result;
      return transaction;
    },
    clear() {
      transactions.clear();
    },
  };
}

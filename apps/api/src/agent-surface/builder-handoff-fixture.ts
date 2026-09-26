import type { Store } from '../platform/store.js';
import type { BuilderHandoffAckInput } from '../creation/builder-handoff-ack.js';

export function acknowledgeHandoffFixture(store: Store) {
  return async (input: BuilderHandoffAckInput) => {
    const handoff = await store.acknowledgeBuilderHandoff(input.jobId, input.acknowledgedAt, input.roundGeneration);
    if (handoff) {
      await input.finalize?.();
      await store.clearBuilderHandoff(input.jobId);
    }
    return { started: handoff !== null };
  };
}

// Logs what each accepted delivery chose for audio.
import type { KitFileStore } from '../agent-surface/kit-files.js';
import { builderLabelFromRecord } from '../platform/delivery-metrics.js';
import type { Store } from '../platform/store.js';
import { audioProfile } from './audio-profile.js';
import type { SourceDeliveryService } from './source-delivery.js';

export const DELIVERY_AUDIO_PROFILE_MSG = 'delivery audio profile';

type Deps = {
  store: Pick<Store, 'getSubmission'>;
  kitFileStore?: KitFileStore | null;
  log?: { info?: (context: object, message: string) => void };
};

export function withAudioProfileLog(service: SourceDeliveryService, deps: Deps): SourceDeliveryService {
  return {
    async deliver(input) {
      const outcome = await service.deliver(input);
      if (!outcome.accepted) return outcome;
      // Best-effort: a metric must never fail a stored delivery.
      try {
        const gameJson = input.files.find((file) => file.path.trim() === 'GAME.json')?.content;
        const record = await deps.store.getSubmission(input.jobId);
        const engineRef = record?.roundKitEngineRef ?? input.kitEngineRef;
        if (!gameJson || !engineRef || !deps.kitFileStore || !deps.log?.info) return outcome;
        const profile = audioProfile({ tree: await deps.kitFileStore.loadTree(engineRef), gameJson });
        if (profile) {
          const audio = {
            jobId: input.jobId,
            roundGeneration: record?.roundGeneration ?? 1,
            builder: builderLabelFromRecord(record?.builder, record?.dispatch?.backend),
            mode: input.mode,
            ...profile,
          };
          deps.log.info({ audio }, DELIVERY_AUDIO_PROFILE_MSG);
        }
      } catch {
        // The delivery already stands.
      }
      return outcome;
    },
  };
}

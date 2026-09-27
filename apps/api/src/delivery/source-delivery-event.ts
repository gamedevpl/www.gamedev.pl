import type { Store } from '../platform/store.js';
import type { Translator } from '../platform/translate.js';
import { normalizeAtIntake } from '../platform/localize-intake.js';
import { sanitizeCreatorText } from '../platform/submission-status.js';

const MAX_DELIVERY_EVENT_TEXT = 300;

export async function reportDeliveryEvent(
  store: Store,
  translator: Translator,
  jobId: number,
  kind: 'blocked' | 'milestone',
  rawText: string,
  roundGeneration: number,
): Promise<void> {
  const clean = sanitizeCreatorText(rawText, { singleLine: true }).slice(0, MAX_DELIVERY_EVENT_TEXT);
  const intake = await normalizeAtIntake(translator, clean, { kind: 'log', maxLength: MAX_DELIVERY_EVENT_TEXT });
  await store.appendBuildEvent(
    jobId,
    {
      kind,
      text: intake.text,
      ...(intake.textLocalized && intake.locale ? { textLocalized: intake.textLocalized, locale: intake.locale } : {}),
    },
    // A system notice about this delivery, not proof the agent itself resumed.
    { preserveEnded: true, roundGeneration },
  );
}

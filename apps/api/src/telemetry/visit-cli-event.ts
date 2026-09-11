import { CLI_ADAPTERS, CLI_INSTALL_CHANNELS, CLI_PLATFORM_OS, CLI_STEPS, CLI_VERIFY_STAGES } from '@gamedevpl/contract';
import { z } from 'zod';
import type { VisitEvent } from '../platform/store.js';

export function cliStepEventSchema(offsetField: { msSinceStart: z.ZodNumber }) {
  return z.object({
    type: z.literal('cli_step'),
    step: z.enum(CLI_STEPS),
    channel: z.enum(CLI_INSTALL_CHANNELS).optional(),
    os: z.enum(CLI_PLATFORM_OS).optional(),
    adapter: z.enum(CLI_ADAPTERS).optional(),
    stage: z.enum(CLI_VERIFY_STAGES).optional(),
    ...offsetField,
  });
}

export function toCliVisitEvent(
  base: Pick<VisitEvent, 'visitId' | 'at' | 'msSinceStart'>,
  event: z.infer<ReturnType<typeof cliStepEventSchema>>,
): VisitEvent {
  return {
    ...base,
    type: event.type,
    step: event.step,
    ...(event.channel === undefined ? {} : { channel: event.channel }),
    ...(event.os === undefined ? {} : { os: event.os }),
    ...(event.adapter === undefined ? {} : { adapter: event.adapter }),
    ...(event.stage === undefined ? {} : { stage: event.stage }),
  };
}

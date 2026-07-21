import type { GameGenerator } from '@gamedevpl/game-generator';
import type { JobRunner } from './types.js';

/**
 * Adapts a GameGenerator into a JobRunner, so the queue can drive any generator —
 * the offline mock today, a containerized agent later — without knowing which.
 *
 * There is no separate provisioning step for an in-process generator, so this
 * reports `running` immediately.
 */
export function generatorRunner(generator: GameGenerator): JobRunner {
  return async (job, context) => {
    context.onRunning();
    return generator.generate(job.prompt);
  };
}

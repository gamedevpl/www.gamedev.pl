import type { PlaytestInstrumentation } from '../../gamePlayer.js';
import type { FeedbackContext } from '../../submissionApi.js';

export function toFeedbackContext(
  pngBase64: string | null | undefined,
  instrumentation: PlaytestInstrumentation,
): FeedbackContext | undefined {
  const hasShot = Boolean(pngBase64);
  const hasSignals =
    instrumentation.playSeconds > 0 ||
    instrumentation.lastAliveFrames != null ||
    instrumentation.errors.length > 0 ||
    instrumentation.progress.length > 0;
  if (!hasShot && !hasSignals) return undefined;
  return {
    ...(pngBase64 ? { screenshotPng: pngBase64 } : {}),
    instrumentation: {
      playSeconds: instrumentation.playSeconds,
      lastAliveFrames: instrumentation.lastAliveFrames,
      errors: instrumentation.errors,
      progress: instrumentation.progress,
    },
  };
}

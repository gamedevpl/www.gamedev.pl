import { isSubmissionInFlight } from '@gamedevpl/contract';
import type { SubmissionState } from './submissionApi.js';
import { getSavedSpecs, removeSpec, saveSpec } from './mySpecs.js';

export function shouldAskUnlisted(status: SubmissionState | null): boolean {
  return isSubmissionInFlight(status);
}

function isRejectedToken(status: number | undefined): boolean {
  return status === 400 || status === 404;
}

export function rememberUnlistedOutcome(
  token: string,
  status: SubmissionState | null,
  slug: string | undefined,
  errorStatus?: number,
): void {
  if (isRejectedToken(errorStatus) || status === 'abandoned') {
    removeSpec(token);
    return;
  }
  if (status === null || isSubmissionInFlight(status)) return;
  const current = getSavedSpecs().find((spec) => spec.token === token);
  if (!current) return;
  saveSpec({ ...current, ...(slug ? { slug } : {}), lastStatus: status });
}

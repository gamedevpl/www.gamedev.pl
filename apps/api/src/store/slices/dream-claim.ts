export interface DreamRunClaim {
  version: string;
  claimedAt: string;
  roundGeneration?: number;
  postedAt?: string;
  endedAt?: string;
  superseded?: boolean;
}

// Long enough for the slowest live worker; generation runs about two minutes.
export const DREAM_CLAIM_TTL_MS = 10 * 60_000;

// Which attempt is speaking: `claimedAt` is unique per retake.
export interface DreamClaimRef {
  version: string;
  claimedAt: string;
  superseded?: boolean;
}

// True when this attempt still owns the claim it is reporting on.
export function ownsDreamClaim(
  held: { version: string; claimedAt: string } | undefined,
  claim: DreamClaimRef,
): boolean {
  return held?.version === claim.version && held.claimedAt === claim.claimedAt;
}

// A claim blocks while the run posted, ended, or may run.
export function dreamClaimHolds(
  claim:
    { version: string; claimedAt: string; roundGeneration?: number; postedAt?: string; endedAt?: string } | undefined,
  version: string,
  at: string,
  roundGeneration: number,
): boolean {
  if (claim?.version !== version) return false;
  // A reopen frees it; an unnumbered claim belongs to round one.
  if ((claim.roundGeneration ?? 1) !== roundGeneration) return false;
  if (claim.postedAt || claim.endedAt) return true;
  return Date.parse(at) - Date.parse(claim.claimedAt) < DREAM_CLAIM_TTL_MS;
}

export function finishClaim(held: DreamRunClaim, claim: DreamClaimRef, at: string): DreamRunClaim {
  return { ...held, endedAt: at, ...(claim.superseded ? { superseded: true } : {}) };
}

// Still drawing: held for this version and round, neither posted nor ended.
export function dreamRunInProgress(
  claim: DreamRunClaim | undefined,
  version: string | undefined,
  at: string,
  roundGeneration: number,
): boolean {
  if (!version || !claim || claim.postedAt || claim.endedAt) return false;
  return dreamClaimHolds(claim, version, at, roundGeneration);
}

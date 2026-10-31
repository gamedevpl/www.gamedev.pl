import { createHash } from 'node:crypto';
import type { SnapshotGame } from './game-snapshot.js';

export type GameArtifact = Readonly<SnapshotGame & { engineRef: string }>;

export interface GameArtifactReceipt {
  engineRef: string;
  htmlSha256: string;
  frames: number;
}

export type VerifyGameArtifact = (artifact: GameArtifact) => Promise<GameArtifactReceipt>;

export function gameHtmlHash(html: string): string {
  return createHash('sha256').update(html).digest('hex');
}

export async function verifyGameArtifact(artifact: GameArtifact, verify: VerifyGameArtifact): Promise<void> {
  const receipt = await verify(Object.freeze(artifact));
  if (
    receipt?.engineRef !== artifact.engineRef ||
    receipt.htmlSha256 !== gameHtmlHash(artifact.html) ||
    !Number.isSafeInteger(receipt.frames) ||
    receipt.frames < 3
  ) {
    throw new Error('Missing or mismatched browser verification for game artifact');
  }
}

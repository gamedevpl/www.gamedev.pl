import * as z from 'zod';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const playHotArtifact = z
  .object({
    protocol: z.literal(1),
    bootHash: hash,
    sourceTreeHash: hash,
    bundleHash: hash,
    stateVersion: z.number().int().positive(),
    observationVersion: z.number().int().positive(),
    bundle: z.string().min(1).max(1_000_000),
  })
  .strict();
export type PlayHotArtifact = z.infer<typeof playHotArtifact>;

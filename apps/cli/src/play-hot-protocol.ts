import * as z from 'zod';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const artifact = z
  .object({
    bootHash: hash,
    sourceTreeHash: hash,
    bundleHash: hash,
    stateVersion: z.number().int().positive(),
    observationVersion: z.number().int().positive(),
    bundle: z.string().min(1).max(1_000_000),
  })
  .strict();
export const playHotArtifact = z.discriminatedUnion('protocol', [
  artifact.extend({ protocol: z.literal(1) }),
  artifact.extend({
    protocol: z.literal(2),
    resources: z
      .object({
        version: z.literal(1),
        hash,
        bytes: z
          .number()
          .int()
          .positive()
          .max(24 * 1024 * 1024 + 16384),
      })
      .strict(),
  }),
]);
export type PlayHotArtifact = z.infer<typeof playHotArtifact>;

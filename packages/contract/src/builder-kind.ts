// Which agent builds this round: the platform team, or the creator.
export const BUILDERS = ['platform', 'self'] as const;
export type BuilderKind = (typeof BUILDERS)[number];

export function isBuilderKind(value: unknown): value is BuilderKind {
  return value === 'platform' || value === 'self';
}

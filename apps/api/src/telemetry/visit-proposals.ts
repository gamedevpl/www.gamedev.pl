import type { VisitEvent } from '../platform/store.js';

const BUILDERS = ['platform', 'self'] as const;
type Builder = (typeof BUILDERS)[number];

export interface ProposalOutcomes {
  // Visits shown at least one concept card; the denominator for the rest.
  exposed: number;
  picked: number;
  postponed: number;
  muted: number;
}

// Decisions per exposure, split by the builder that drew it.
export interface ProposalRead extends ProposalOutcomes {
  byBuilder: Array<{ builder: Builder | 'unknown' } & ProposalOutcomes>;
}

type Seen = { exposed: Set<string>; picked: Set<string>; postponed: Set<string>; muted: Set<string> };

function seen(): Seen {
  return { exposed: new Set(), picked: new Set(), postponed: new Set(), muted: new Set() };
}

function outcomes(from: Seen): ProposalOutcomes {
  // Counted inside the exposed set, so no ratio exceeds one.
  const within = (decided: Set<string>) => [...decided].filter((id) => from.exposed.has(id)).length;
  return {
    exposed: from.exposed.size,
    picked: within(from.picked),
    postponed: within(from.postponed),
    muted: within(from.muted),
  };
}

function builderOf(value: string | undefined): Builder | 'unknown' {
  return value === 'platform' || value === 'self' ? value : 'unknown';
}

export function summarizeProposals(events: readonly VisitEvent[]): ProposalRead {
  const all = seen();
  const perBuilder = new Map<Builder | 'unknown', Seen>();

  for (const event of events) {
    if (event.type !== 'studio_step' || !event.step?.startsWith('proposal_')) continue;
    const key = event.step.slice('proposal_'.length);
    if (key !== 'shown' && key !== 'picked' && key !== 'postponed' && key !== 'muted') continue;
    const bucket = key === 'shown' ? 'exposed' : key;
    const builder = builderOf(event.builder);
    const own = perBuilder.get(builder) ?? seen();
    perBuilder.set(builder, own);
    all[bucket].add(event.visitId);
    own[bucket].add(event.visitId);
  }

  const rows = BUILDERS.map((builder) => ({ builder, ...outcomes(perBuilder.get(builder) ?? seen()) }));
  const unknown = perBuilder.get('unknown');
  return {
    ...outcomes(all),
    // `unknown` appears only if a client wrote a card without the dimension.
    byBuilder: unknown ? [...rows, { builder: 'unknown' as const, ...outcomes(unknown) }] : rows,
  };
}

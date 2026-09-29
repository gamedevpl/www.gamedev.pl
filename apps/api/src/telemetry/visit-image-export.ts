import type { VisitEvent } from '../platform/store.js';

export interface ImageExportRead {
  // Visits shown at least one save-photo prompt.
  requested: number;
  // Of those, visits that saved, dismissed, or whose download threw.
  saved: number;
  dismissed: number;
  failed: number;
  // Visits where the shell refused a request outright; no prompt needed.
  rejected: number;
}

export function summarizeImageExport(events: readonly VisitEvent[]): ImageExportRead {
  const seen = {
    requested: new Set<string>(),
    saved: new Set<string>(),
    dismissed: new Set<string>(),
    failed: new Set<string>(),
  };
  const rejected = new Set<string>();
  for (const event of events) {
    if (event.type !== 'image_export_step') continue;
    if (event.step === 'rejected') rejected.add(event.visitId);
    else if (event.step && Object.hasOwn(seen, event.step)) {
      seen[event.step as keyof typeof seen].add(event.visitId);
    }
  }
  // Outcomes only inside the prompted set, so no ratio exceeds one.
  const within = (ids: Set<string>) => [...ids].filter((id) => seen.requested.has(id)).length;
  return {
    requested: seen.requested.size,
    saved: within(seen.saved),
    dismissed: within(seen.dismissed),
    failed: within(seen.failed),
    rejected: rejected.size,
  };
}

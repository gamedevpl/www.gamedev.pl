export interface PublishResult {
  ok: true;
  slug: string;
  version: string;
  publishedAt: string;
}

export type PublishRefusal =
  | 'gate_red'
  | 'not_gated'
  | 'nothing_delivered'
  | 'profile_required'
  | 'preview_superseded_delivery'
  | 'store_unavailable'
  | 'editorial_cut'
  | 'editorial_pending'
  | 'reason_required'
  | 'reason_too_long'
  | 'unknown';

export interface EditorialCounts {
  reviewers: number;
  keep: number;
  cut: number;
  skip: number;
  weakOrBad: Record<string, number>;
}

export type PublishOutcome = PublishResult | { refused: PublishRefusal; editorial?: EditorialCounts };

export async function publishJob(
  jobId: number,
  body?: { override?: boolean; overrideReason?: string },
): Promise<PublishOutcome> {
  const response = await fetch(`/api/admin/jobs/${jobId}/publish`, {
    method: 'POST',
    credentials: 'include',
    ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  if (response.ok) return (await response.json()) as PublishResult;
  const payload = (await response.json().catch(() => ({}))) as Partial<EditorialCounts> & { error?: string };
  const known: PublishRefusal[] = [
    'gate_red',
    'not_gated',
    'nothing_delivered',
    'profile_required',
    'preview_superseded_delivery',
    'store_unavailable',
    'editorial_cut',
    'editorial_pending',
    'reason_required',
    'reason_too_long',
  ];
  const refused = known.find((code) => code === payload.error) ?? 'unknown';
  const editorial =
    typeof payload.reviewers !== 'number'
      ? undefined
      : {
          reviewers: payload.reviewers,
          keep: payload.keep ?? 0,
          cut: payload.cut ?? 0,
          skip: payload.skip ?? 0,
          weakOrBad: payload.weakOrBad ?? {},
        };
  return { refused, editorial };
}

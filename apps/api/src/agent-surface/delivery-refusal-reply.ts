import type { SourceDeliveryRejected } from '../delivery/source-delivery.js';

// What a refused delivery tells the builder, per refusal.
export function deliveryRefusalFields(
  delivery: SourceDeliveryRejected,
  source: 'staged' | 'latest' | 'inline',
): Record<string, unknown> {
  // Inline files are never copied into staging on a refusal.
  const kept =
    source === 'staged'
      ? 'Your staged sources stay staged; inline files sent with them were not kept'
      : source === 'latest'
        ? 'The latest delivery stays as it was for another fromLatestDelivery; inline overrides were not kept'
        : 'Files sent inline were not kept; send them again';
  switch (delivery.rejected) {
    case 'stopped':
      return {
        retry: 'This round no longer accepts deliveries from this session; another submit_sources is refused too.',
      };
    case 'rate_limited':
      return {
        retry: `Too many deliveries for this job in the last hour. ${kept}; the limit frees up as that hour passes.`,
      };
    case 'delivery_cap':
    case 'job_delivery_cap':
      return {
        reason: 'self_build_delivery_cap',
        deliveryCap: delivery.deliveryCap,
        deliveriesUsed: delivery.deliveriesUsed,
        retry: `All ${delivery.deliveryCap} deliveries ${delivery.rejected === 'delivery_cap' ? 'of this round' : 'of this job'} are used; another submit_sources is refused the same way.`,
      };
    case 'gate_capacity':
      return {
        reason: 'gate_capacity',
        retry:
          delivery.gateCapacity === 'paused'
            ? `An operator has paused gate runs. ${kept}; every submit_sources is refused the same way until gate runs resume.`
            : `The platform’s gate runs for today are spent; the allowance resets at 00:00 UTC. ${kept}; every submit_sources before then is refused the same way.`,
      };
    case 'content_rejected':
      return {
        reason: 'content_rejected',
        category: delivery.category,
        retry: 'SPEC.md or GAME.json carries text this platform will not publish. Rewrite it and deliver again.',
      };
    case 'moderation_unavailable':
      return {
        reason: 'moderation_unavailable',
        retry: `The content check could not run. ${kept}; deliver again shortly.`,
      };
  }
}

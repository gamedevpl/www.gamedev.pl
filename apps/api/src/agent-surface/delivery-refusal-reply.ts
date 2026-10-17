import type { SourceDeliveryRejected } from '../delivery/source-delivery.js';

// What a refused delivery tells the builder, per refusal.
export function deliveryRefusalFields(delivery: SourceDeliveryRejected): Record<string, unknown> {
  switch (delivery.rejected) {
    case 'delivery_cap':
    case 'job_delivery_cap':
      return {
        reason: 'self_build_delivery_cap',
        deliveryCap: delivery.deliveryCap,
        deliveriesUsed: delivery.deliveriesUsed,
      };
    case 'gate_capacity':
      return {
        reason: 'gate_capacity',
        retry:
          delivery.gateCapacity === 'paused'
            ? 'An operator has paused gate runs. Your sources stay staged; every submit_sources is refused the same way until gate runs resume.'
            : 'The platform’s gate runs for today are spent; the allowance resets at 00:00 UTC. Your sources stay staged; every submit_sources before then is refused the same way.',
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
        retry: 'the content check could not run — your sources are staged, deliver again shortly',
      };
    default:
      return {};
  }
}

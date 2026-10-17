import { describe, expect, it } from 'vitest';
import { deliveryRefusalFields } from './delivery-refusal-reply.js';

describe('deliveryRefusalFields', () => {
  const daily = { accepted: false, rejected: 'gate_capacity', gateCapacity: 'daily_cap' } as const;

  it('says what survived the refusal, by where the sources came from', () => {
    expect(deliveryRefusalFields(daily, 'staged').retry).toMatch(
      /staged sources stay staged; inline files sent with them were not kept/,
    );
    expect(deliveryRefusalFields(daily, 'latest').retry).toMatch(/latest delivery stays.*fromLatestDelivery/);
    expect(deliveryRefusalFields(daily, 'inline').retry).toMatch(/sent inline were not kept/);
  });

  it('gives every refusal a retry', () => {
    for (const rejected of ['stopped', 'rate_limited', 'delivery_cap', 'content_rejected'] as const) {
      expect(deliveryRefusalFields({ accepted: false, rejected, deliveryCap: 3 }, 'staged').retry).toBeTruthy();
    }
  });
});

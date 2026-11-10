import { describe, expect, it } from 'vitest';
import { DiscoveryJournal, type DiscoveryFlush } from './discoveryJournal.js';

function journal() {
  const sent: DiscoveryFlush[] = [];
  let now = 0;
  const j = new DiscoveryJournal(
    'cozycraft',
    'id-1',
    (body) => sent.push(body),
    () => now,
  );
  return { j, sent, tick: (ms: number) => (now += ms) };
}

describe('DiscoveryJournal', () => {
  it('records each landmark once per open, with its offset', () => {
    const { j, sent, tick } = journal();
    tick(1000);
    expect(j.found('first-combo')).toBe(true);
    expect(j.found('first-combo')).toBe(false);
    tick(500);
    j.found('  secret-owl ');
    j.flush();
    expect(sent).toEqual([
      {
        slug: 'cozycraft',
        journalId: 'id-1',
        flushMsSinceOpen: 1500,
        found: [
          { label: 'first-combo', msSinceOpen: 1000 },
          { label: 'secret-owl', msSinceOpen: 1500 },
        ],
      },
    ]);
  });

  it('sends nothing when nothing happened, and play seconds when only play did', () => {
    const { j, sent } = journal();
    j.flush();
    expect(sent).toHaveLength(0);
    j.played(15);
    j.flush();
    expect(sent[0]).toMatchObject({ found: [], playSeconds: 15 });
  });

  it('clamps labels and caps distinct labels and labels per flush', () => {
    const { j, sent } = journal();
    j.found('x'.repeat(100));
    for (let i = 0; i < 500; i += 1) j.found(`l-${i}`);
    j.found('');
    j.flush();
    const all = sent.flatMap((body) => body.found);
    expect(all[0]?.label).toHaveLength(40);
    expect(all).toHaveLength(400);
    expect(Math.max(...sent.map((body) => body.found.length))).toBe(50);
  });
});

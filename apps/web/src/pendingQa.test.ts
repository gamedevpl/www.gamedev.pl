// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPendingQa, loadPendingQa, savePendingQa } from './pendingQa';

const session = {
  spec: { title: 'Kosmiczny listonosz', concept: 'Deliver parcels between planets', displayName: 'Greg' },
  questions: [{ id: 'style', question: 'What style?', options: [{ label: 'Pixel Art' }] }],
  answers: { selected: { style: ['Pixel Art'] }, custom: { style: 'Amiga palette' } },
};

describe('pendingQa', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('round-trips a session so a reload resumes where the creator left off', () => {
    savePendingQa(session);

    const restored = loadPendingQa();
    expect(restored?.spec).toEqual(session.spec);
    expect(restored?.questions).toEqual(session.questions);
    expect(restored?.answers).toEqual(session.answers);
  });

  it('drops a session older than a day instead of resurrecting a forgotten idea', () => {
    savePendingQa(session);
    const stored = JSON.parse(localStorage.getItem('gamedev_pending_qa')!);
    localStorage.setItem(
      'gamedev_pending_qa',
      JSON.stringify({ ...stored, savedAt: Date.now() - 25 * 60 * 60 * 1000 }),
    );

    expect(loadPendingQa()).toBeNull();
    // ...and the stale blob is gone, not left to be re-read on every load.
    expect(localStorage.getItem('gamedev_pending_qa')).toBeNull();
  });

  it('survives a corrupt or half-written blob rather than wedging creation', () => {
    localStorage.setItem('gamedev_pending_qa', '{not json');
    expect(loadPendingQa()).toBeNull();

    localStorage.setItem('gamedev_pending_qa', JSON.stringify({ spec: { title: 'x' }, questions: [] }));
    expect(loadPendingQa()).toBeNull();
  });

  it('tolerates storage being unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    // Persistence is a convenience; a private-mode browser must still be able to create.
    expect(() => savePendingQa(session)).not.toThrow();
  });

  it('clears on demand', () => {
    savePendingQa(session);
    clearPendingQa();
    expect(loadPendingQa()).toBeNull();
  });
});

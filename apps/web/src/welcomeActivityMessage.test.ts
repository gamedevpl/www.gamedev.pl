import { afterEach, expect, it, vi } from 'vitest';
import { welcomeProgressMessage } from './welcomeProgress.js';
import { presenceThought, presenceThoughtLabel } from './surfaces/studio/presenceThought.js';
import type { SubmissionStatus } from './submissionApi.js';

afterEach(() => vi.useRealTimers());
it('labels generated activity and expires its text independently of newer tool events', () => {
  vi.useFakeTimers();
  const now = new Date('2026-11-17T10:00:00Z');
  vi.setSystemTime(now);
  const t = (key: string) => key;
  const status: SubmissionStatus = {
    status: 'building',
    lastAgentPresence: {
      key: 'managed_editing_files',
      at: now.toISOString(),
      textAt: now.toISOString(),
      text: 'Zmieniono teren.',
    },
  };
  expect(welcomeProgressMessage(status, t)).toBe('Zmieniono teren.');
  expect(presenceThoughtLabel(presenceThought(status)!, t)).toBe('statusView.activitySummary Zmieniono teren.');
  vi.advanceTimersByTime(90_001);
  status.lastAgentPresence!.at = new Date().toISOString();
  expect(welcomeProgressMessage(status, t)).toBe('statusView.presence.managed_editing_files');
  expect(presenceThought(status)?.text).toBeUndefined();
});

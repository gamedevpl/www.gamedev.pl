import { useEffect, useState } from 'react';
import type { LocalActivity } from '@gamedevpl/contract';
import { LOCAL_ACTIVITY_TERMINAL, nextLocalActivityDelay } from './localActivityPoll.js';

export function localActivityPhase(
  activity: LocalActivity | null,
  now: number,
): LocalActivity['phase'] | 'offline' | null {
  if (!activity) return null;
  if (LOCAL_ACTIVITY_TERMINAL.includes(activity.phase)) return activity.phase;
  return now - Date.parse(activity.at) > 45_000 ? 'offline' : activity.phase;
}

export function useLocalActivity(token: string, enabled = true) {
  const [activity, setActivity] = useState<LocalActivity | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) {
      setActivity(null);
      return;
    }
    let disposed = false;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let empty = 0;
    let latest: LocalActivity | null = null;
    const hidden = (): boolean => document.visibilityState === 'hidden';
    const schedule = (): void => {
      if (!disposed && !hidden()) timer = setTimeout(() => void poll(), nextLocalActivityDelay(latest, empty));
    };
    const poll = async (): Promise<void> => {
      if (disposed || hidden()) return;
      setNow(Date.now());
      controller?.abort();
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 8000);
      try {
        const response = await fetch(`/api/me/studio/local-activity/${encodeURIComponent(token)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const body = (await response.json()) as { activity: LocalActivity | null };
        latest = body.activity;
        empty = body.activity ? 0 : empty + 1;
        if (!disposed) setActivity(body.activity);
      } catch {
        // Preserve the last observation and its age.
      } finally {
        clearTimeout(timeout);
        schedule();
      }
    };
    const onVisible = (): void => {
      clearTimeout(timer);
      if (hidden()) return;
      empty = 0;
      void poll();
    };
    void poll();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      controller?.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [token, enabled]);
  return { activity, phase: localActivityPhase(activity, now) };
}

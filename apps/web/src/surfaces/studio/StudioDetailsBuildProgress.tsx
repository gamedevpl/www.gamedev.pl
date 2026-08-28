import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StudioBuildHistory } from './StudioBuildHistory.js';
import { getSubmissionStatus, type SubmissionStatus } from '../../submissionApi.js';

// Details refreshes slower than the thread's own live pulse.
const DETAILS_POLL_MS = 10_000;

// Self-fetching wrapper for callers with no status poll of their own.
export function StudioDetailsBuildProgress({
  token,
  emptyLabel,
  onSelectPreviewVersion,
  activePreviewVersion,
  onReverted,
}: {
  token: string;
  // Shown when there's neither a checklist nor build history yet.
  emptyLabel?: string;
  onSelectPreviewVersion?: (version: string | null) => void;
  activePreviewVersion?: string | null;
  onReverted?: (result: { version: string; token?: string; roundOpened?: number }) => void;
}) {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<SubmissionStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Bumped to force an immediate re-poll (e.g. right after sealing) instead of waiting
  // out DETAILS_POLL_MS — canSeal would otherwise read stale for that whole window.
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const next = await getSubmissionStatus(token, i18n.language);
        if (cancelled) return;
        setStatus(next);
      } catch {
        // Secondary chrome — a failed poll must not toast over the thread.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), DETAILS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token, i18n.language, refreshNonce]);

  if (!status) {
    return loaded ? null : <p className="studio-rail-empty">{t('statusView.loading')}</p>;
  }

  return (
    <StudioBuildHistory
      status={status}
      token={token}
      emptyLabel={emptyLabel}
      onSelectPreviewVersion={onSelectPreviewVersion}
      activePreviewVersion={activePreviewVersion}
      onReverted={onReverted}
      onSealed={() => setRefreshNonce((n) => n + 1)}
    />
  );
}

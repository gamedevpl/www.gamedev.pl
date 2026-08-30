import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StudioBuildHistory } from './StudioBuildHistory.js';
import { pokeStudioStatus, subscribeStudioStatus } from './studioStatusStore.js';
import type { SubmissionStatus } from '../../submissionApi.js';

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

  useEffect(() => {
    return subscribeStudioStatus(token, i18n.language, {
      intervalMs: () => DETAILS_POLL_MS,
      onUpdate: (next) => {
        setStatus(next);
        setLoaded(true);
      },
      onError: () => setLoaded(true),
    });
  }, [token, i18n.language]);

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
      onSealed={() => pokeStudioStatus(token, i18n.language)}
    />
  );
}

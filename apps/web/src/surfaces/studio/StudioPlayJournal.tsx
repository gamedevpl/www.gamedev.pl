import { StudioCreatorProfileProvider } from '../../studioCreatorProfile.js';
import { useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PlayJournalBuffer } from './playJournalBuffer.js';
import { JournalContext, type useJournalAttachment } from './studioPlayJournalHooks.js';
export function StudioPlayJournalProvider({ children }: { children: ReactNode }) {
  const buffer = useMemo(() => new PlayJournalBuffer(), []);
  return <JournalContext.Provider value={buffer}>{children}</JournalContext.Provider>;
}
export function JournalAttachmentControl({
  attachment,
  disabled = false,
}: {
  attachment: ReturnType<typeof useJournalAttachment>;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { buffer, attached, setAttached } = attachment;
  useSyncExternalStore(buffer?.subscribe ?? noSubscribe, buffer?.getRevision ?? zero, zero);
  if (!buffer) return null;
  const available = buffer.summary();
  const selected = attached ?? available;
  const seconds = attached
    ? Math.round(((attached.entries.at(-1)?.timeMs ?? 0) - (attached.entries[0]?.timeMs ?? 0)) / 1000)
    : (available?.seconds ?? 0);
  return (
    <div className="studio-journal-attachment">
      <button
        type="button"
        className="secondary-btn"
        disabled={disabled || (!attached && !available)}
        aria-pressed={Boolean(attached)}
        onClick={() => setAttached(attached ? null : buffer.snapshot())}
      >
        {t(attached ? 'studioJournal.remove' : 'studioJournal.attach')}
      </button>
      {selected ? (
        <small>{t(attached ? 'studioJournal.attached' : 'studioJournal.local', { seconds })}</small>
      ) : (
        <small>{t('studioJournal.empty')}</small>
      )}
    </div>
  );
}
const zero = () => 0;
const noSubscribe = () => () => {};

export function StudioJournalCreatorProvider({ children, gameKey }: { children: ReactNode; gameKey: string | null }) {
  return (
    <StudioCreatorProfileProvider>
      <StudioPlayJournalProvider key={gameKey}>{children}</StudioPlayJournalProvider>
    </StudioCreatorProfileProvider>
  );
}

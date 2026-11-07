import { StudioCreatorProfileProvider } from '../../studioCreatorProfile.js';
import { PixelIcon } from '../../PixelIcon.js';
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
  compact = false,
}: {
  attachment: ReturnType<typeof useJournalAttachment>;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const { buffer, attached, setAttached } = attachment;
  useSyncExternalStore(buffer?.subscribe ?? noSubscribe, buffer?.getRevision ?? zero, zero);
  if (!buffer || (compact && attached)) return null;
  const available = buffer.summary();
  const selected = attached ?? available;
  const seconds = attached
    ? Math.round(((attached.entries.at(-1)?.timeMs ?? 0) - (attached.entries[0]?.timeMs ?? 0)) / 1000)
    : (available?.seconds ?? 0);
  const label = t(attached ? 'studioJournal.remove' : 'studioJournal.attach');
  const help = selected
    ? t(attached ? 'studioJournal.attached' : 'studioJournal.local', { seconds })
    : t('studioJournal.empty');
  const button = (
    <button
      type="button"
      className={compact ? 'prompt-attach-item' : 'secondary-btn'}
      role={compact ? 'menuitem' : undefined}
      disabled={disabled || (!attached && !available)}
      aria-label={label}
      aria-pressed={compact ? undefined : Boolean(attached)}
      title={`${label}. ${help}`}
      onClick={() => setAttached(attached ? null : buffer.snapshot())}
    >
      {compact ? <PixelIcon name="gamepad" size={16} /> : null}
      {compact ? t(attached ? 'studioJournal.attachedShort' : 'studioJournal.attachShort', { seconds }) : label}
    </button>
  );
  return compact ? (
    button
  ) : (
    <div className="studio-journal-attachment">
      {button}
      <small>{help}</small>
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

export function JournalAttachmentChip({
  attachment,
  disabled = false,
}: {
  attachment: ReturnType<typeof useJournalAttachment>;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { attached, setAttached } = attachment;
  if (!attached) return null;
  const seconds = Math.round(((attached.entries.at(-1)?.timeMs ?? 0) - (attached.entries[0]?.timeMs ?? 0)) / 1000);
  return (
    <div className="status-composer-attachment-chip studio-journal-chip">
      <PixelIcon name="gamepad" size={16} />
      <span>{t('studioJournal.attachedShort', { seconds })}</span>
      <button
        type="button"
        className="status-composer-attachment-remove"
        disabled={disabled}
        aria-label={t('studioJournal.remove')}
        title={t('studioJournal.remove')}
        onClick={() => setAttached(null)}
      >
        <PixelIcon name="close" size={11} />
      </button>
    </div>
  );
}

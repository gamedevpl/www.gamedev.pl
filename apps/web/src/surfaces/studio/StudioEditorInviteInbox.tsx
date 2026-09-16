import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from '../../PixelIcon.js';
import { recordShareStep } from '../../visitTelemetry.js';
import {
  fetchIncomingEditorInvites,
  respondToEditorInvite,
  type EditorInviteApiError,
  type EditorInviteSummary,
} from '../../editorInviteApi.js';

const RESPOND_REFUSALS: Record<string, string> = {
  recipient_ineligible: 'studioShelf.share.errors.ineligible',
  stale_owner: 'studioShelf.share.errors.staleOwner',
  not_found: 'studioShelf.share.errors.gone',
  already_member: 'studioShelf.share.errors.alreadyMember',
  member_cap: 'studioShelf.share.errors.memberCap',
};

export function StudioEditorInviteInbox({
  onAccepted,
  visible = true,
  onOffersPresent,
}: {
  onAccepted?: (slug: string) => void;
  visible?: boolean;
  onOffersPresent?: () => void;
}): JSX.Element | null {
  const { t } = useTranslation();
  const [incoming, setIncoming] = useState<EditorInviteSummary[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  const load = useCallback(async () => {
    try {
      setIncoming(await fetchIncomingEditorInvites());
      setUnreachable(false);
    } catch {
      setUnreachable(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function respond(invite: EditorInviteSummary, decision: 'accept' | 'reject'): Promise<void> {
    setBusyId(invite.inviteId);
    setError(null);
    try {
      await respondToEditorInvite(invite.inviteId, decision);
      recordShareStep(decision === 'accept' ? 'accepted' : 'declined');
      setIncoming((current) => current.filter((row) => row.inviteId !== invite.inviteId));
      if (decision === 'accept') onAccepted?.(invite.slug);
    } catch (caught) {
      const reason = (caught as EditorInviteApiError)?.code;
      setError(
        reason && RESPOND_REFUSALS[reason] ? t(RESPOND_REFUSALS[reason]) : t('studioShelf.share.errors.respond'),
      );
    } finally {
      setBusyId(null);
    }
  }

  const pending = incoming.filter((invite) => invite.status === 'pending');
  const offered = pending.length > 0;
  const announced = useRef(false);
  useEffect(() => {
    if (!offered || announced.current) return;
    announced.current = true;
    if (!visible) onOffersPresent?.();
  }, [offered, visible, onOffersPresent]);

  if (pending.length === 0 && !unreachable) return null;

  return (
    <section
      className="studio-transfer-inbox"
      aria-label={t('studioShelf.share.title')}
      data-testid="studio-share-inbox"
    >
      {pending.length > 0 ? (
        <ul className="studio-transfer-invites">
          {pending.map((invite) => (
            <li key={invite.inviteId} data-testid={`studio-share-invite-${invite.slug}`}>
              <p className="studio-transfer-who">
                <PixelIcon name="share" size={14} />
                <span>
                  {t('studioShelf.share.offer', {
                    name: invite.counterparty.profileName,
                    slug: invite.slug,
                  })}
                </span>
              </p>
              <div className="studio-transfer-actions">
                <button
                  type="button"
                  className="primary-btn"
                  disabled={busyId === invite.inviteId}
                  onClick={() => void respond(invite, 'accept')}
                  data-testid={`studio-share-accept-${invite.slug}`}
                >
                  {t('studioShelf.share.accept')}
                </button>
                <button
                  type="button"
                  className="status-delete"
                  disabled={busyId === invite.inviteId}
                  onClick={() => void respond(invite, 'reject')}
                  data-testid={`studio-share-reject-${invite.slug}`}
                >
                  {t('studioShelf.share.reject')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {unreachable ? (
        <p className="error" role="alert" data-testid="studio-share-inbox-unreachable">
          {t('studioShelf.share.errors.unreachable')}{' '}
          <button type="button" className="link-btn" onClick={() => void load()} data-testid="studio-share-retry">
            {t('studioShelf.share.retry')}
          </button>
        </p>
      ) : null}

      {error ? (
        <p className="error" role="alert" data-testid="studio-share-inbox-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from '../../PixelIcon.js';
import { recordTransferStep } from '../../visitTelemetry.js';
import {
  fetchIncomingTransfers,
  respondToTransfer,
  type TransferApiError,
  type TransferSummary,
} from '../../transferApi.js';

// Offers only; the code moved to account settings.

// Answering an invitation can refuse for reasons of its own.
const RESPOND_REFUSALS: Record<string, string> = {
  busy: 'studioShelf.transfer.errors.busy',
  recipient_ineligible: 'studioShelf.transfer.errors.ineligible',
  stale_owner: 'studioShelf.transfer.errors.staleOwner',
  not_found: 'studioShelf.transfer.errors.gone',
};

export function StudioTransferInbox({
  onAccepted,
  visible = true,
  onOffersPresent,
}: {
  onAccepted?: (slug: string) => void;
  // False while the shelf is collapsed or off-canvas.
  visible?: boolean;
  onOffersPresent?: () => void;
}): JSX.Element | null {
  const { t } = useTranslation();
  const [incoming, setIncoming] = useState<TransferSummary[]>([]);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  const load = useCallback(async () => {
    try {
      setIncoming(await fetchIncomingTransfers());
      // A failed read is not an empty inbox.
      setUnreachable(false);
    } catch {
      setUnreachable(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Takes the invitation, not the slug: the answer has to name the offer.
  async function respond(invite: TransferSummary, decision: 'accept' | 'reject'): Promise<void> {
    const slug = invite.slug;
    setBusySlug(slug);
    setError(null);
    try {
      await respondToTransfer(slug, decision, invite.invitationId);
      recordTransferStep(decision === 'accept' ? 'offer_accepted' : 'offer_declined');
      setIncoming((current) => current.filter((invite) => invite.slug !== slug));
      // Not on the shelf until the caller refetches.
      if (decision === 'accept') onAccepted?.(slug);
    } catch (caught) {
      const reason = (caught as TransferApiError)?.code;
      setError(
        reason && RESPOND_REFUSALS[reason] ? t(RESPOND_REFUSALS[reason]) : t('studioShelf.transfer.errors.respond'),
      );
    } finally {
      setBusySlug(null);
    }
  }

  const pending = incoming.filter((invite) => invite.status === 'pending');
  // An unseen invitation is what the notification exists to fix.
  const offered = pending.length > 0;
  // Decided once, on arrival; a later collapse is the reader's.
  const announced = useRef(false);
  useEffect(() => {
    if (!offered || announced.current) return;
    announced.current = true;
    if (!visible) onOffersPresent?.();
  }, [offered, visible, onOffersPresent]);

  // Shown means shown; a hidden render inflates the denominator.
  useEffect(() => {
    if (offered && visible) recordTransferStep('offer_shown');
  }, [offered, visible]);

  // Nothing to say without an invitation or a failure to report.
  if (pending.length === 0 && !unreachable) return null;

  return (
    <section
      className="studio-transfer-inbox"
      aria-label={t('studioShelf.transfer.title')}
      data-testid="studio-transfer-inbox"
    >
      {pending.length > 0 ? (
        <ul className="studio-transfer-invites">
          {pending.map((invite) => (
            <li key={invite.slug} data-testid={`studio-transfer-invite-${invite.slug}`}>
              <p className="studio-transfer-who">
                <PixelIcon name="handover" size={14} />
                <span>
                  {t('studioShelf.transfer.offer', {
                    name: invite.counterparty.profileName ?? t('studioShelf.transfer.someone'),
                    slug: invite.slug,
                  })}
                </span>
              </p>
              <div className="studio-transfer-actions">
                <button
                  type="button"
                  className="primary-btn"
                  disabled={busySlug === invite.slug}
                  onClick={() => void respond(invite, 'accept')}
                  data-testid={`studio-transfer-accept-${invite.slug}`}
                >
                  {t('studioShelf.transfer.accept')}
                </button>
                <button
                  type="button"
                  className="status-delete"
                  disabled={busySlug === invite.slug}
                  onClick={() => void respond(invite, 'reject')}
                  data-testid={`studio-transfer-reject-${invite.slug}`}
                >
                  {t('studioShelf.transfer.reject')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {unreachable ? (
        <p className="error" role="alert" data-testid="studio-transfer-inbox-unreachable">
          {t('studioShelf.transfer.errors.unreachable')}{' '}
          <button type="button" className="link-btn" onClick={() => void load()} data-testid="studio-transfer-retry">
            {t('studioShelf.transfer.retry')}
          </button>
        </p>
      ) : null}

      {error ? (
        <p className="error" role="alert" data-testid="studio-transfer-inbox-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}

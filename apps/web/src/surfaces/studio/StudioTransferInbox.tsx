import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from '../../PixelIcon.js';
import {
  fetchIncomingTransfers,
  fetchRecipientCode,
  respondToTransfer,
  rotateRecipientCode,
  type TransferApiError,
  type TransferSummary,
} from '../../transferApi.js';

// Account-level: an offered game is not yours to select yet.

export function StudioTransferInbox({ onAccepted }: { onAccepted?: () => void }): JSX.Element | null {
  const { t } = useTranslation();
  const [code, setCode] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<TransferSummary[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // A missing code must not hide an invitation.
    const [codeResult, incomingResult] = await Promise.allSettled([fetchRecipientCode(), fetchIncomingTransfers()]);
    if (codeResult.status === 'fulfilled') setCode(codeResult.value);
    if (incomingResult.status === 'fulfilled') setIncoming(incomingResult.value);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function rotate(): Promise<void> {
    setRotating(true);
    setError(null);
    try {
      setCode(await rotateRecipientCode());
      setRevealed(true);
    } catch {
      setError(t('studioShelf.transfer.errors.rotate'));
    } finally {
      setRotating(false);
    }
  }

  async function respond(slug: string, decision: 'accept' | 'reject'): Promise<void> {
    setBusySlug(slug);
    setError(null);
    try {
      await respondToTransfer(slug, decision);
      setIncoming((current) => current.filter((invite) => invite.slug !== slug));
      // Not on the shelf until the caller refetches.
      if (decision === 'accept') onAccepted?.();
    } catch (caught) {
      const reason = (caught as TransferApiError)?.code;
      setError(reason === 'busy' ? t('studioShelf.transfer.errors.busy') : t('studioShelf.transfer.errors.respond'));
    } finally {
      setBusySlug(null);
    }
  }

  const pending = incoming.filter((invite) => invite.status === 'pending');
  // Nothing to say without an invitation or a code.
  if (pending.length === 0 && !code) return null;

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
                    name: invite.counterparty.profileName,
                    slug: invite.slug,
                  })}
                </span>
              </p>
              <div className="studio-transfer-actions">
                <button
                  type="button"
                  className="primary-btn"
                  disabled={busySlug === invite.slug}
                  onClick={() => void respond(invite.slug, 'accept')}
                  data-testid={`studio-transfer-accept-${invite.slug}`}
                >
                  {t('studioShelf.transfer.accept')}
                </button>
                <button
                  type="button"
                  className="status-delete"
                  disabled={busySlug === invite.slug}
                  onClick={() => void respond(invite.slug, 'reject')}
                  data-testid={`studio-transfer-reject-${invite.slug}`}
                >
                  {t('studioShelf.transfer.reject')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {code ? (
        <div className="studio-transfer-code">
          <span className="studio-transfer-code-label">{t('studioShelf.transfer.yourCode')}</span>
          <code data-testid="studio-recipient-code">{revealed ? code : '••••••••'}</code>
          <button type="button" className="link-btn" onClick={() => setRevealed((shown) => !shown)}>
            {revealed ? t('studioShelf.transfer.hide') : t('studioShelf.transfer.reveal')}
          </button>
          <button
            type="button"
            className="link-btn"
            onClick={() => void rotate()}
            disabled={rotating}
            data-testid="studio-recipient-code-rotate"
          >
            {rotating ? t('studioShelf.transfer.rotating') : t('studioShelf.transfer.rotate')}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="error" role="alert" data-testid="studio-transfer-inbox-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}

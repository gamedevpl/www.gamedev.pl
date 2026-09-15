import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from '../../PixelIcon.js';
import { formatRelativeTime } from '../../relativeTime.js';
import {
  cancelGameTransfer,
  fetchGameTransfer,
  startGameTransfer,
  type TransferApiError,
  type TransferSummary,
} from '../../transferApi.js';

// Nothing moves until the recipient accepts the invitation.

// Every refusal the routes answer with, in creator words.
const REFUSALS: Record<string, string> = {
  invalid_code: 'studioPanel.transfer.errors.invalidCode',
  cannot_transfer_to_self: 'studioPanel.transfer.errors.self',
  recipient_ineligible: 'studioPanel.transfer.errors.ineligible',
  busy: 'studioPanel.transfer.errors.busy',
  stale_owner: 'studioPanel.transfer.errors.staleOwner',
  not_owner: 'studioPanel.transfer.errors.notOwner',
};

export function StudioTransferPanel({ slug }: { slug: string }): JSX.Element {
  const { t, i18n } = useTranslation();
  const [transfer, setTransfer] = useState<TransferSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTransfer(await fetchGameTransfer(slug));
    } catch {
      setError(t('studioPanel.transfer.errors.load'));
    } finally {
      setLoading(false);
    }
  }, [slug, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // A refusal names a reason; anything else is generic.
  function explain(caught: unknown): string {
    const code = (caught as TransferApiError)?.code;
    return code && REFUSALS[code] ? t(REFUSALS[code]) : t('studioPanel.transfer.errors.generic');
  }

  async function send(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      setTransfer(await startGameTransfer(slug, trimmed));
      setCode('');
    } catch (caught) {
      setError(explain(caught));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      setTransfer(await cancelGameTransfer(slug));
    } catch (caught) {
      setError(explain(caught));
    } finally {
      setBusy(false);
    }
  }

  const pending = transfer?.status === 'pending' ? transfer : null;

  return (
    <div className="studio-transfer" data-testid="studio-transfer">
      <p className="studio-rail-credentials-hint">{t('studioPanel.transfer.intro')}</p>

      {loading ? <p className="studio-connect-state">{t('studioPanel.transfer.loading')}</p> : null}

      {!loading && pending ? (
        <div className="studio-transfer-pending" data-testid="studio-transfer-pending">
          <p className="studio-transfer-who">
            <PixelIcon name="handover" size={14} />
            <span>{t('studioPanel.transfer.pending', { name: pending.counterparty.profileName })}</span>
          </p>
          <p className="studio-transfer-expiry">
            {t('studioPanel.transfer.expires', {
              when: formatRelativeTime(Date.parse(pending.expiresAt), i18n.language),
            })}
          </p>
          <button
            type="button"
            className="status-delete"
            onClick={() => void cancel()}
            disabled={busy}
            data-testid="studio-transfer-cancel"
          >
            {busy ? t('studioPanel.transfer.cancelling') : t('studioPanel.transfer.cancel')}
          </button>
        </div>
      ) : null}

      {!loading && !pending ? (
        <form className="studio-transfer-form" onSubmit={(event) => void send(event)}>
          <label htmlFor="studio-transfer-code">{t('studioPanel.transfer.codeLabel')}</label>
          <input
            id="studio-transfer-code"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={code}
            placeholder={t('studioPanel.transfer.codePlaceholder')}
            onChange={(event) => setCode(event.target.value)}
            disabled={busy}
            data-testid="studio-transfer-code"
          />
          <p className="studio-transfer-expiry">{t('studioPanel.transfer.codeHint')}</p>
          <button type="submit" className="primary-btn" disabled={busy || code.trim().length === 0}>
            {busy ? t('studioPanel.transfer.sending') : t('studioPanel.transfer.send')}
          </button>
        </form>
      ) : null}

      {error ? (
        <p className="error" role="alert" data-testid="studio-transfer-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

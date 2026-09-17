import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from '../../PixelIcon.js';
import { recordTransferStep } from '../../visitTelemetry.js';
import { formatRelativeTime } from '../../relativeTime.js';
import { studioPath } from '../../core/router.js';
import { fetchGameTransfer, type TransferApiError, type TransferSummary } from '../../transferApi.js';
import './studio-panel.css';

interface ProposalSummary {
  proposalId: string;
  slug: string;
  status: string;
  expiresAt: string;
  title: string;
}

const REFUSALS: Record<string, string> = {
  invalid_code: 'studioPanel.transfer.errors.invalidCode',
  cannot_transfer_to_self: 'studioPanel.transfer.errors.self',
  recipient_ineligible: 'studioPanel.transfer.errors.ineligible',
  stale_owner: 'studioPanel.transfer.errors.staleOwner',
  not_owner: 'studioPanel.transfer.errors.notOwner',
  expired: 'studioPanel.transferPropose.expired',
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: { accept: 'application/json', ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    const error = new Error(typeof body.error === 'string' ? body.error : 'request_failed') as Error & {
      code?: string;
    };
    error.code = typeof body.error === 'string' ? body.error : 'request_failed';
    throw error;
  }
  return body;
}

export function StudioTransferProposalConfirm({
  slug,
  proposalId,
  onOpenStudio,
}: {
  slug: string;
  proposalId: string;
  onOpenStudio: (path: string) => void;
}): JSX.Element {
  const { t, i18n } = useTranslation();
  const [proposal, setProposal] = useState<ProposalSummary | null>(null);
  const [transfer, setTransfer] = useState<TransferSummary | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const path = `/api/me/studio/games/${encodeURIComponent(slug)}/transfer/propose/${encodeURIComponent(proposalId)}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body = await request<{ proposal: ProposalSummary }>(path);
      setProposal(body.proposal);
      setError(null);
    } catch {
      setProposal(null);
      setError(t('studioPanel.transferPropose.missing'));
    } finally {
      setLoading(false);
    }
  }, [path, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirm(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = await request<{ transfer: TransferSummary }>(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recipientCode: trimmed }),
      });
      setTransfer(body.transfer);
      setCode('');
      recordTransferStep('invite_sent');
    } catch (caught) {
      // Creating refuses as busy only when an invitation is already out.
      const reason = (caught as TransferApiError)?.code;
      if (reason === 'busy') {
        const open = await fetchGameTransfer(slug).catch(() => null);
        if (open?.status === 'pending') {
          setTransfer(open);
          setCode('');
        } else {
          setError(t('studioPanel.transfer.errors.alreadyOut'));
        }
      } else {
        setError(reason && REFUSALS[reason] ? t(REFUSALS[reason]) : t('studioPanel.transfer.errors.generic'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="studio-transfer" data-testid="studio-transfer-propose">
      <p className="studio-rail-credentials-hint">{t('studioPanel.transferPropose.intro')}</p>
      {loading ? <p className="studio-connect-state">{t('studioPanel.transfer.loading')}</p> : null}
      {error ? (
        <p className="studio-connect-state" role="alert" data-testid="studio-transfer-propose-error">
          {error}
        </p>
      ) : null}
      {!loading && proposal && !transfer && proposal.status !== 'ready' ? (
        <p className="studio-connect-state">
          {t(
            proposal.status === 'expired'
              ? 'studioPanel.transferPropose.expired'
              : 'studioPanel.transferPropose.missing',
          )}
        </p>
      ) : null}
      {!loading && proposal && !transfer && proposal.status === 'ready' ? (
        <form className="studio-transfer-form" onSubmit={(event) => void confirm(event)}>
          <p>{t('studioPanel.transferPropose.game', { title: proposal.title })}</p>
          <p className="studio-transfer-expiry">
            {t('studioPanel.transfer.expires', {
              when: formatRelativeTime(Date.parse(proposal.expiresAt), i18n.language),
            })}
          </p>
          <label htmlFor="studio-transfer-propose-code">{t('studioPanel.transfer.codeLabel')}</label>
          <input
            id="studio-transfer-propose-code"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={code}
            placeholder={t('studioPanel.transfer.codePlaceholder')}
            onChange={(event) => setCode(event.target.value)}
            disabled={busy}
            data-testid="studio-transfer-propose-code"
          />
          <p className="studio-transfer-expiry">{t('studioPanel.transfer.codeHint')}</p>
          <button type="submit" disabled={busy || !code.trim()} data-testid="studio-transfer-propose-send">
            {busy ? t('studioPanel.transfer.sending') : t('studioPanel.transferPropose.confirm')}
          </button>
        </form>
      ) : null}
      {transfer ? (
        <div data-testid="studio-transfer-propose-sent">
          <p>
            <PixelIcon name="handover" size={14} />{' '}
            {t('studioPanel.transfer.pending', {
              name: transfer.counterparty.profileName ?? t('studioPanel.transfer.someone'),
            })}
          </p>
          <button type="button" onClick={() => onOpenStudio(studioPath(slug, 'details'))}>
            {t('studioPanel.transferPropose.back')}
          </button>
        </div>
      ) : null}
    </main>
  );
}

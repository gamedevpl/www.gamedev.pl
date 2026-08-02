import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon.js';
import { CONNECT_CLIENTS, getConnectPayload, type ConnectClient, type ConnectPayload } from './connectApi.js';
import { recordStudioStep } from './visitTelemetry.js';

const CLIENT_LABEL_KEY: Record<ConnectClient, string> = {
  claudeCode: 'connect.clients.claudeCode',
  codex: 'connect.clients.codex',
  cursor: 'connect.clients.cursor',
  kimi: 'connect.clients.kimi',
  cli: 'connect.clients.cli',
};

type StudioConnectCardProps = {
  token: string;
  /**
   * When true, the round already has an agent signal — the parent should unmount this
   * and show normal progress. Kept as a prop so tests can drive the flip without a
   * status poll.
   */
  agentConnected?: boolean;
};

/**
 * Connect card for a self-build round waiting on the creator's own coding agent.
 *
 * Step 1: add gamedev.pl to the agent (install snippets, skip if already done).
 * Step 2: paste the kickoff prompt (round key embedded). Live waiting flips away on
 * the first agent signal — the parent hides this when `stall` leaves `no_agent_yet`.
 */
export function StudioConnectCard({ token, agentConnected = false }: StudioConnectCardProps) {
  const { t, i18n } = useTranslation();
  const baseId = useId();
  const [payload, setPayload] = useState<ConnectPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<ConnectClient>('claudeCode');
  const [step1Skipped, setStep1Skipped] = useState(false);
  const [copied, setCopied] = useState<'install' | 'kickoff' | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getConnectPayload(token)
      .then((next) => {
        if (!cancelled) {
          setPayload(next);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(t('connect.loadError'));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, t]);

  if (agentConnected) {
    return null;
  }

  const copy = async (text: string, which: 'install' | 'kickoff') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Snippet stays on screen to select by hand.
    }
    // Count the click either way — clipboard denial still means they meant to connect.
    recordStudioStep('connect_copied', 'self', which);
  };

  const expiresLabel = payload
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(payload.expiresAt * 1000),
      )
    : '';

  const installSnippet = payload?.installSnippets[client] ?? '';

  return (
    <section className="studio-connect" aria-labelledby={`${baseId}-title`}>
      <h3 id={`${baseId}-title`} className="studio-connect-title">
        {t('connect.title')}
      </h3>
      <p className="studio-connect-lead">{t('connect.lead')}</p>

      {loading ? <p className="studio-connect-state">{t('connect.loading')}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {payload && !loading ? (
        <>
          <div className="studio-connect-step">
            <div className="studio-connect-step-head">
              <span className="studio-connect-step-num" aria-hidden="true">
                1
              </span>
              <h4 className="studio-connect-step-title">{t('connect.step1.title')}</h4>
            </div>
            {step1Skipped ? (
              <p className="studio-connect-skipped">{t('connect.step1.skipped')}</p>
            ) : (
              <>
                <div className="studio-connect-tabs" role="tablist" aria-label={t('connect.step1.clients')}>
                  {CONNECT_CLIENTS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={client === id}
                      className={`studio-connect-tab${client === id ? ' is-active' : ''}`}
                      onClick={() => setClient(id)}
                    >
                      {t(CLIENT_LABEL_KEY[id])}
                    </button>
                  ))}
                </div>
                <pre className="studio-connect-snippet" tabIndex={0}>
                  {installSnippet}
                </pre>
                <div className="studio-connect-actions">
                  <button
                    type="button"
                    className="status-share-copy"
                    onClick={() => void copy(installSnippet, 'install')}
                  >
                    <PixelIcon name={copied === 'install' ? 'check' : 'sparkle'} size={12} />{' '}
                    {copied === 'install' ? t('connect.copied') : t('connect.copyInstall')}
                  </button>
                  <button type="button" className="studio-connect-skip" onClick={() => setStep1Skipped(true)}>
                    {t('connect.step1.skip')}
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="studio-connect-step">
            <div className="studio-connect-step-head">
              <span className="studio-connect-step-num" aria-hidden="true">
                2
              </span>
              <h4 className="studio-connect-step-title">{t('connect.step2.title')}</h4>
            </div>
            {/* The split creators miss at a round boundary: the gamedev.pl connection in
                their agent's config is set up once (step 1) and stays put; what changes
                every round is the key inside the prompt below. Without this line, a
                creator handed a new build thread re-runs step 1 or edits config that was
                never stale. */}
            <p className="studio-connect-same">{t('connect.step2.sameConnection')}</p>
            <pre className="studio-connect-snippet studio-connect-kickoff" tabIndex={0}>
              {payload.kickoffPrompt}
            </pre>
            <div className="studio-connect-actions">
              <button
                type="button"
                className="status-share-copy"
                onClick={() => void copy(payload.kickoffPrompt, 'kickoff')}
              >
                <PixelIcon name={copied === 'kickoff' ? 'check' : 'sparkle'} size={12} />{' '}
                {copied === 'kickoff' ? t('connect.copied') : t('connect.copyKickoff')}
              </button>
            </div>
            <p className="studio-connect-expiry">{t('connect.step2.expiry', { when: expiresLabel })}</p>
          </div>

          <p className="studio-connect-waiting" aria-live="polite">
            <span className="studio-connect-pulse" aria-hidden="true" />
            {t('connect.waiting')}
          </p>
        </>
      ) : null}
    </section>
  );
}

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon.js';
import {
  CONNECT_CLIENTS,
  getConnectPayload,
  rotateCreatorAgentKey,
  type ConnectClient,
  type ConnectPayload,
} from './connectApi.js';
import { recordStudioStep } from './visitTelemetry.js';

const CLIENT_LABEL_KEY: Record<ConnectClient, string> = {
  claudeCode: 'connect.clients.claudeCode',
  codex: 'connect.clients.codex',
  cursor: 'connect.clients.cursor',
  kimi: 'connect.clients.kimi',
  cli: 'connect.clients.cli',
};

const AUTH_MODE_STORAGE_KEY = 'gamedev_connect_auth_mode';

type ConnectAuthMode = 'key' | 'oauth';

function loadAuthMode(): ConnectAuthMode {
  try {
    const raw = localStorage.getItem(AUTH_MODE_STORAGE_KEY);
    return raw === 'oauth' ? 'oauth' : 'key';
  } catch {
    return 'key';
  }
}

function saveAuthMode(mode: ConnectAuthMode): void {
  try {
    localStorage.setItem(AUTH_MODE_STORAGE_KEY, mode);
  } catch {
    // Convenience only.
  }
}

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
 * Connect card for a self-build round waiting on the creator's own coding agent (BY-27b).
 *
 * Step 1: paste MCP config (URL + Authorization header) — or choose OAuth sign-in.
 * Step 2: paste the keyless kickoff prompt (slug only; never a secret).
 * The full Authorization value is held in memory for Copy and never rendered.
 */
export function StudioConnectCard({ token, agentConnected = false }: StudioConnectCardProps) {
  const { t, i18n } = useTranslation();
  const baseId = useId();
  const authHeaderRef = useRef<string | null>(null);
  const [payload, setPayload] = useState<ConnectPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<ConnectClient>('claudeCode');
  const [authMode, setAuthMode] = useState<ConnectAuthMode>(() => loadAuthMode());
  const [copied, setCopied] = useState<'config' | 'kickoff' | null>(null);
  const [rotateArmed, setRotateArmed] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getConnectPayload(token)
      .then((next) => {
        if (!cancelled) {
          authHeaderRef.current = next.authorizationHeader;
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

  const chooseAuthMode = (mode: ConnectAuthMode) => {
    setAuthMode(mode);
    saveAuthMode(mode);
  };

  const copyText = async (text: string, which: 'config' | 'kickoff') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Snippet stays on screen to select by hand.
    }
    recordStudioStep('connect_copied', 'self', which === 'config' ? 'install' : 'kickoff');
  };

  const copyConfig = async () => {
    const header = authHeaderRef.current;
    if (!payload || !header) return;
    // Rebuild the active client's snippet with the real Authorization value.
    const masked = payload.authorizationHeaderMasked;
    const realSnippet = payload.installSnippets[client].split(masked).join(header);
    await copyText(realSnippet, 'config');
  };

  const handleRotate = async () => {
    setRotating(true);
    setRotateError(null);
    try {
      await rotateCreatorAgentKey();
      const next = await getConnectPayload(token);
      authHeaderRef.current = next.authorizationHeader;
      setPayload(next);
      setRotateArmed(false);
    } catch {
      setRotateError(t('connect.rotate.error'));
    } finally {
      setRotating(false);
    }
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
          <div className="studio-connect-tabs" role="tablist" aria-label={t('connect.authMode.label')}>
            <button
              type="button"
              role="tab"
              aria-selected={authMode === 'key'}
              className={`studio-connect-tab${authMode === 'key' ? ' is-active' : ''}`}
              onClick={() => chooseAuthMode('key')}
            >
              {t('connect.authMode.key')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={authMode === 'oauth'}
              className={`studio-connect-tab${authMode === 'oauth' ? ' is-active' : ''}`}
              onClick={() => chooseAuthMode('oauth')}
            >
              {t('connect.authMode.oauth')}
            </button>
          </div>

          {authMode === 'key' ? (
            <div className="studio-connect-step">
              <div className="studio-connect-step-head">
                <span className="studio-connect-step-num" aria-hidden="true">
                  1
                </span>
                <h4 className="studio-connect-step-title">{t('connect.step1.title')}</h4>
              </div>
              <p className="studio-connect-same">{t('connect.step1.configHint')}</p>
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
              <pre className="studio-connect-snippet" tabIndex={0} data-testid="connect-config-snippet">
                {installSnippet}
              </pre>
              <p className="studio-connect-expiry" data-testid="connect-key-meta">
                {t('connect.step1.meta', {
                  fingerprint: payload.fingerprint,
                  when: expiresLabel,
                  generation: payload.keyGeneration,
                })}
              </p>
              <div className="studio-connect-actions">
                <button type="button" className="status-share-copy" onClick={() => void copyConfig()}>
                  <PixelIcon name={copied === 'config' ? 'check' : 'sparkle'} size={12} />{' '}
                  {copied === 'config' ? t('connect.copied') : t('connect.copyConfig')}
                </button>
                {!rotateArmed ? (
                  <button type="button" className="studio-connect-skip" onClick={() => setRotateArmed(true)}>
                    {t('connect.rotate.start')}
                  </button>
                ) : (
                  <span className="studio-connect-rotate-confirm">
                    <span>{t('connect.rotate.confirm')}</span>
                    <button
                      type="button"
                      className="studio-connect-skip is-danger"
                      disabled={rotating}
                      onClick={() => void handleRotate()}
                    >
                      {rotating ? t('connect.rotate.sending') : t('connect.rotate.yes')}
                    </button>
                    <button
                      type="button"
                      className="studio-connect-skip"
                      disabled={rotating}
                      onClick={() => setRotateArmed(false)}
                    >
                      {t('connect.rotate.no')}
                    </button>
                  </span>
                )}
              </div>
              {rotateError ? <p className="error">{rotateError}</p> : null}
            </div>
          ) : (
            <div className="studio-connect-step">
              <div className="studio-connect-step-head">
                <span className="studio-connect-step-num" aria-hidden="true">
                  1
                </span>
                <h4 className="studio-connect-step-title">{t('connect.oauth.title')}</h4>
              </div>
              <p className="studio-connect-same">{t('connect.oauth.hint')}</p>
              <pre className="studio-connect-snippet" tabIndex={0}>
                {payload.mcpUrl}
              </pre>
              <div className="studio-connect-actions">
                <button
                  type="button"
                  className="status-share-copy"
                  onClick={() => void copyText(payload.mcpUrl, 'config')}
                >
                  <PixelIcon name={copied === 'config' ? 'check' : 'sparkle'} size={12} />{' '}
                  {copied === 'config' ? t('connect.copied') : t('connect.copyUrl')}
                </button>
              </div>
            </div>
          )}

          <div className="studio-connect-step">
            <div className="studio-connect-step-head">
              <span className="studio-connect-step-num" aria-hidden="true">
                2
              </span>
              <h4 className="studio-connect-step-title">{t('connect.step2.title')}</h4>
            </div>
            <p className="studio-connect-same">{t('connect.step2.sameConnection')}</p>
            <pre className="studio-connect-snippet studio-connect-kickoff" tabIndex={0} data-testid="connect-kickoff">
              {payload.kickoffPrompt}
            </pre>
            <div className="studio-connect-actions">
              <button
                type="button"
                className="status-share-copy"
                onClick={() => void copyText(payload.kickoffPrompt, 'kickoff')}
              >
                <PixelIcon name={copied === 'kickoff' ? 'check' : 'sparkle'} size={12} />{' '}
                {copied === 'kickoff' ? t('connect.copied') : t('connect.copyKickoff')}
              </button>
            </div>
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

import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { getConnectPayload, type ConnectClient, type ConnectPayload, type ConnectApiError } from './connectApi.js';
import { SwitchToPlatformControl } from './StudioConnectCard.js';
import { useCliSurfaceEnabled } from '../../useCliSurfaceEnabled.js';
import { recordStudioStep } from '../../visitTelemetry.js';
import './studio-connect-guide.css';

type Route = 'cli' | 'agent' | 'platform';
type Tool = Exclude<ConnectClient, 'cli'> | 'vscode' | 'other' | 'muse';
const TOOLS: Tool[] = ['cursor', 'vscode', 'claudeCode', 'codex', 'kimi', 'muse', 'other'];

export function StudioConnectGuide({
  token,
  onSwitchToPlatform,
  pending,
  panel = false,
  unavailableLabel,
}: {
  token: string;
  onSwitchToPlatform: ComponentProps<typeof SwitchToPlatformControl>['onSwitchToPlatform'];
  pending: boolean;
  panel?: boolean;
  unavailableLabel?: string;
}) {
  const { t } = useTranslation();
  const cliEnabled = useCliSurfaceEnabled();
  const [payload, setPayload] = useState<ConnectPayload | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [route, setRoute] = useState<Route | null>(null);
  const [tool, setTool] = useState<Tool | null>(null);
  const [stage, setStage] = useState<'setup' | 'start'>('setup');
  const [manual, setManual] = useState(false);
  const [windows, setWindows] = useState(false);
  const [copied, setCopied] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let cancelled = false;
    setError(false);
    setUnavailable(false);
    void getConnectPayload(token)
      .then((value) => {
        if (!cancelled) setPayload(value);
      })
      .catch((failure: ConnectApiError) => {
        if (cancelled) return;
        if (failure.status === 409 && ['not_self_round', 'inactive_round'].includes(failure.reason ?? ''))
          setUnavailable(true);
        else setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);
  useEffect(() => {
    heading.current?.focus();
    setCopied('');
  }, [route, tool, stage]);

  const copy = async (text: string, id: string, detail: 'install' | 'kickoff') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      recordStudioStep('connect_copied', 'self', detail);
    } catch {
      setCopied('error');
    }
  };
  const copyButton = (text: string, id: string, detail: 'install' | 'kickoff' = 'install') => (
    <button type="button" className="btn btn-secondary" onClick={() => void copy(text, id, detail)}>
      {copied === id ? t('connect.copied') : t('connectGuide.copy')}
    </button>
  );
  const back = () => {
    if (stage === 'start') setStage('setup');
    else if (tool) {
      setTool(null);
      setManual(false);
    } else setRoute(null);
  };
  if (unavailable && unavailableLabel) return <p className="studio-rail-empty">{unavailableLabel}</p>;
  if (error || unavailable)
    return (
      <div role="alert">
        <p>{t('connectWizard.loadError')}</p>
        <button className="btn btn-secondary" onClick={() => setAttempt(attempt + 1)}>
          {t('connectGuide.retry')}
        </button>
      </div>
    );
  if (!payload) return <p role="status">{t('connect.loading')}</p>;
  const local = route === 'cli' || tool === 'muse';
  const cliSnippet = windows
    ? `irm ${window.location.origin}/install.ps1 | iex\ngamedevpl login\ngamedevpl connect ${payload.slug}`
    : `curl -fsSL ${window.location.origin}/install.sh | bash\ngamedevpl login\ngamedevpl connect ${payload.slug}`;
  const keyClient = tool && tool !== 'vscode' && tool !== 'other' && tool !== 'muse' ? tool : 'cursor';
  const masked =
    tool === 'vscode' || tool === 'other'
      ? `URL: ${payload.mcpUrl}\n${payload.authorizationHeaderMasked}`
      : payload.installSnippets[keyClient];
  const realSnippet = masked
    .split(payload.authorizationHeaderMasked)
    .join(payload.authorizationHeader)
    .split(payload.authorizationHeaderMasked.replace(/^Authorization:\s*/i, ''))
    .join(payload.authorizationHeader.replace(/^Authorization:\s*/i, ''));
  const oauth = tool !== 'kimi' && tool !== 'muse';
  const step = !route ? 1 : route === 'agent' && !tool ? 2 : stage === 'start' ? 4 : 3;
  const title = !route
    ? 'choose'
    : route === 'platform'
      ? 'platformTitle'
      : route === 'agent' && !tool
        ? 'tool'
        : stage === 'start'
          ? 'start'
          : 'setup';
  return (
    <section className={`connect-guide${panel ? ' connect-guide-panel' : ''}`} aria-labelledby="connect-guide-title">
      <div className="connect-guide-nav">
        {route && (
          <button type="button" className="studio-connect-skip" onClick={back}>
            {t('connectGuide.back')}
          </button>
        )}
        <span>
          {t('connectGuide.progress', {
            step: route === 'cli' ? (stage === 'start' ? 3 : 2) : route === 'platform' ? 2 : step,
            total: route === 'cli' ? 3 : route === 'platform' ? 2 : 4,
          })}
        </span>
      </div>
      <h3 id="connect-guide-title" ref={heading} tabIndex={-1}>
        {t(`connectGuide.${title}`)}
      </h3>
      {route && route !== 'platform' && <p className="connect-guide-mode">{t('connectGuide.selfMode')}</p>}
      {!route ? (
        <div className="connect-guide-options">
          {(['cli', 'agent', 'platform'] as const)
            .filter((id) => (id === 'cli' ? cliEnabled : id === 'platform' ? payload.canSwitchToPlatform : true))
            .map((id) => (
              <button type="button" className="connect-guide-option" key={id} onClick={() => setRoute(id)}>
                <strong>{t(`connectGuide.routes.${id}.title`)}</strong>
                <span>{t(`connectGuide.routes.${id}.body`)}</span>
                <span aria-hidden="true">→</span>
              </button>
            ))}
        </div>
      ) : route === 'platform' ? (
        <>
          <p>{t('connectGuide.platformBody')}</p>
          <SwitchToPlatformControl onSwitchToPlatform={onSwitchToPlatform} pending={pending} />
        </>
      ) : route === 'agent' && !tool ? (
        <div className="connect-guide-tools">
          {TOOLS.map((id) => (
            <button type="button" className="connect-guide-option" key={id} onClick={() => setTool(id)}>
              <strong>{t(`connectGuide.tools.${id}`)}</strong>
            </button>
          ))}
        </div>
      ) : stage === 'start' ? (
        <>
          <p>
            {t(
              tool === 'muse' ? 'connectGuide.museStart' : local ? 'connectGuide.cliStart' : 'connectGuide.agentStart',
            )}
          </p>
          {local && (
            <>
              <pre className="studio-connect-snippet" tabIndex={0}>
                {cliSnippet}
              </pre>
              {copyButton(cliSnippet, 'cli')}
            </>
          )}
          {!local && (
            <>
              <pre className="studio-connect-snippet" tabIndex={0}>
                {payload.kickoffPrompt}
              </pre>
              {copyButton(payload.kickoffPrompt, 'kickoff', 'kickoff')}
            </>
          )}
          <p className="connect-guide-wait" role="status">
            {t(panel ? 'connectGuide.panelWaiting' : 'connectGuide.waiting')}
          </p>
        </>
      ) : (
        <>
          <p>
            {local
              ? t('connectGuide.cliSetup')
              : t('connectGuide.toolSetup', { tool: t(`connectGuide.tools.${tool}`) })}
          </p>
          {local ? (
            <>
              <div className="connect-guide-tools">
                <button className="btn btn-secondary" aria-pressed={!windows} onClick={() => setWindows(false)}>
                  macOS / Linux
                </button>
                <button className="btn btn-secondary" aria-pressed={windows} onClick={() => setWindows(true)}>
                  Windows
                </button>
              </div>
              <pre className="studio-connect-snippet" tabIndex={0}>
                {cliSnippet}
              </pre>
              {copyButton(cliSnippet, 'cli')}
              <p>{t('connectGuide.cliDraft')}</p>
            </>
          ) : (
            <>
              {oauth && !manual ? (
                <>
                  {(tool === 'cursor' || tool === 'vscode') && payload.installLinks?.[tool] ? (
                    <a
                      className="btn btn-primary"
                      href={payload.installLinks[tool]}
                      onClick={() => recordStudioStep('connect_deeplink', 'self', tool)}
                    >
                      {t('connectGuide.add', { tool: t(`connectGuide.tools.${tool}`) })}
                    </a>
                  ) : (
                    <>
                      <pre className="studio-connect-snippet" tabIndex={0}>
                        {payload.mcpUrl}
                      </pre>
                      {copyButton(payload.mcpUrl, 'url')}
                    </>
                  )}
                  <p>{t('connectGuide.signin')}</p>
                  <button type="button" className="studio-connect-skip" onClick={() => setManual(true)}>
                    {t('connectGuide.manual')}
                  </button>
                </>
              ) : (
                <>
                  <p>{t('connectGuide.configHint')}</p>
                  <pre className="studio-connect-snippet" tabIndex={0}>
                    {masked}
                  </pre>
                  {copyButton(realSnippet, 'config')}
                  {oauth && (
                    <button className="studio-connect-skip" onClick={() => setManual(false)}>
                      {t('connectGuide.oauth')}
                    </button>
                  )}
                </>
              )}
            </>
          )}
          <button type="button" className="btn btn-primary" onClick={() => setStage('start')}>
            {t('connectGuide.next')}
          </button>
        </>
      )}
      {copied === 'error' && <p role="alert">{t('connectGuide.copyError')}</p>}
    </section>
  );
}

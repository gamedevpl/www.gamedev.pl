import type { BuilderKind } from '@gamedevpl/contract';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from '../../PixelIcon.js';
import type { BuilderUnavailableReason } from '../../BuilderChoice.js';
import {
  CONNECT_CLIENTS,
  getConnectPayload,
  rotateCreatorAgentKey,
  type ConnectApiError,
  type ConnectClient,
  type ConnectPayload,
} from './connectApi.js';
import { isConnectCollapsed, setConnectCollapsed } from '../../connectCollapse.js';
import type { ConnectCardMode } from '../../selfBuildCopy.js';
import { recordStudioStep } from '../../visitTelemetry.js';

export type { ConnectCardMode };

const CLIENT_LABEL_KEY: Record<ConnectClient, string> = {
  claudeCode: 'connect.clients.claudeCode',
  codex: 'connect.clients.codex',
  cursor: 'connect.clients.cursor',
  kimi: 'connect.clients.kimi',
  cli: 'connect.clients.cli',
};

const AUTH_MODE_STORAGE_KEY = 'gamedev_connect_auth_mode';

// Past this many ms unconfirmed, offer a retry.
export const HANDOFF_STALE_MS = 20_000;

type ConnectAuthMode = 'key' | 'oauth';

/** Reasons the connect endpoint returns 409 that mean "no card belongs here". */
const QUIET_UNAVAILABLE = new Set(['not_self_round', 'inactive_round']);

function loadAuthMode(): ConnectAuthMode {
  try {
    const raw = localStorage.getItem(AUTH_MODE_STORAGE_KEY);
    // Sign-in is the default path — paste-header is the escape hatch (Cursor bugs, CLI).
    return raw === 'key' ? 'key' : 'oauth';
  } catch {
    return 'oauth';
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
  /**
   * `setup` (default): full MCP install + kickoff for the first connect.
   * `resume`: kickoff-first after quiet / gate-green — install stays under a details
   * disclosure so a mid-round stall does not look like a project reset.
   */
  mode?: ConnectCardMode;
  /**
   * When true (default), the creator can hide the tall card and restore it from a
   * one-line strip — so connect steps do not own the whole thread after first look.
   */
  collapsible?: boolean;
  /**
   * When true, a non-self / inactive round yields nothing instead of an error
   * (Details mounts this for every open game; only self rounds have a payload).
   * Pair with `unavailableLabel` in the Details pane so the Connect icon does not
   * open a blank rail for platform rounds.
   */
  hideIfUnavailable?: boolean;
  /** Shown instead of null when `hideIfUnavailable` quiets a non-self round. */
  unavailableLabel?: string;
  /**
   * Studio thread: open the Details rail for MCP install instead of expanding it
   * inline (Claude-shaped — install lives in the side panel, not the transcript).
   * Standalone `/status` leaves this unset and keeps the inline disclosure.
   */
  onOpenInstall?: () => void;
  /**
   * `panel`: denser Details-rail layout — no lead/waiting wall, kickoff tucked under
   * a disclosure so install stays scannable. `thread` (default) keeps the full card.
   */
  density?: 'thread' | 'panel';
  // Foot bar already says "waiting for your agent" — do not repeat.
  waitingCaptionElsewhere?: boolean;
  /** Section heading when `density="panel"` — omitted when the card returns null. */
  panelHeading?: string;
  onSwitchToPlatform?: SwitchHandler;
  builderHandoffPending?: boolean;
  // Why switching to platform is unavailable, if it is.
  platformUnavailable?: BuilderUnavailableReason;
};

type SwitchResult = { pending?: boolean };
type SwitchHandler = () => Promise<void | SwitchResult> | void | SwitchResult;

type SwitchBuilderControlProps = {
  target: BuilderKind;
  onSwitch: SwitchHandler;
  compact?: boolean;
  active?: boolean;
  pending?: boolean;
  // Meaningless for target: 'self'.
  unavailable?: BuilderUnavailableReason;
};

function SwitchBuilderControl({
  target,
  onSwitch,
  compact = false,
  active = false,
  pending = false,
  unavailable,
}: SwitchBuilderControlProps) {
  const { t } = useTranslation();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [handoffPending, setHandoffPending] = useState(pending);
  const [error, setError] = useState<string | null>(null);
  // Restarts the stale timer on every confirm/retry.
  const [attempt, setAttempt] = useState(0);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (pending) setHandoffPending(true);
  }, [pending]);

  useEffect(() => {
    if (!handoffPending) {
      setStale(false);
      return;
    }
    setStale(false);
    const timer = window.setTimeout(() => setStale(true), HANDOFF_STALE_MS);
    return () => window.clearTimeout(timer);
  }, [handoffPending, attempt]);

  const confirm = async () => {
    setAttempt((n) => n + 1);
    setBusy(true);
    setError(null);
    try {
      const result = await onSwitch();
      recordStudioStep('builder_chosen', target);
      setBusy(false);
      setArmed(false);
      setHandoffPending(typeof result === 'object' && result !== null && result.pending === true);
    } catch {
      setBusy(false);
      setArmed(false);
      setError(t('connect.switchBuilder.error'));
    }
  };

  // `pending` decides if a retried handoff landed.
  const retry = async () => {
    setAttempt((n) => n + 1);
    setBusy(true);
    setError(null);
    try {
      await onSwitch();
    } catch {
      setError(t('connect.switchBuilder.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={compact ? 'studio-active-handoff' : 'studio-connect-switch'}
      data-testid={
        compact && target === 'self'
          ? 'active-switch-builder-self'
          : compact
            ? 'active-switch-builder'
            : 'connect-switch-builder'
      }
    >
      {!compact ? <p className="studio-connect-switch-hint">{t('connect.switchBuilder.hint')}</p> : null}
      {target === 'platform' && unavailable ? (
        // Never disabled — that would drop it from the tab order.
        <button
          type="button"
          className={`${compact ? 'studio-active-handoff-button' : 'studio-connect-switch-button'} is-unavailable`}
          aria-disabled="true"
          title={t(`builder.platform.unavailable.detail.${unavailable}`)}
          onClick={(event) => event.preventDefault()}
        >
          {t(`builder.platform.unavailable.badge.${unavailable}`)}
        </button>
      ) : handoffPending ? (
        <div className={compact ? 'studio-active-handoff-pending-group' : 'studio-connect-switch-pending-group'}>
          <p className={compact ? 'studio-active-handoff-pending' : 'studio-connect-switch-pending'} aria-live="polite">
            {t(stale ? 'connect.switchBuilder.pendingStale' : 'connect.switchBuilder.pending')}
          </p>
          {stale ? (
            <button
              type="button"
              className={compact ? 'studio-active-handoff-button' : 'studio-connect-switch-button'}
              onClick={() => void retry()}
              disabled={busy}
            >
              {busy ? t('connect.switchBuilder.sending') : t('connect.switchBuilder.retry')}
            </button>
          ) : null}
        </div>
      ) : !armed ? (
        <button
          type="button"
          className={compact ? 'studio-active-handoff-button' : 'studio-connect-switch-button'}
          onClick={() => setArmed(true)}
          disabled={busy}
        >
          {active
            ? t(target === 'platform' ? 'connect.switchBuilder.activeStart' : 'connect.switchBuilder.activeSelfStart')
            : t('connect.switchBuilder.start')}
        </button>
      ) : (
        <div className={compact ? 'studio-active-handoff-confirm' : 'studio-connect-switch-confirm'}>
          <span>
            {active
              ? t(
                  target === 'platform'
                    ? 'connect.switchBuilder.activeConfirm'
                    : 'connect.switchBuilder.activeSelfConfirm',
                )
              : t('connect.switchBuilder.confirm')}
          </span>
          <button
            type="button"
            className={compact ? 'studio-active-handoff-button is-primary' : 'studio-connect-switch-button is-primary'}
            onClick={() => void confirm()}
            disabled={busy}
          >
            {busy
              ? t('connect.switchBuilder.sending')
              : active
                ? t(target === 'platform' ? 'connect.switchBuilder.activeYes' : 'connect.switchBuilder.activeSelfYes')
                : t('connect.switchBuilder.yes')}
          </button>
          <button type="button" className="studio-connect-skip" onClick={() => setArmed(false)} disabled={busy}>
            {t('connect.switchBuilder.no')}
          </button>
        </div>
      )}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}

export function SwitchToPlatformControl({
  onSwitchToPlatform,
  compact = false,
  active = false,
  pending = false,
  unavailable,
}: {
  onSwitchToPlatform: SwitchHandler;
  compact?: boolean;
  active?: boolean;
  pending?: boolean;
  unavailable?: BuilderUnavailableReason;
}) {
  return (
    <SwitchBuilderControl
      target="platform"
      onSwitch={onSwitchToPlatform}
      compact={compact}
      active={active}
      pending={pending}
      unavailable={unavailable}
    />
  );
}

export function SwitchToSelfControl({
  onSwitchToSelf,
  compact = false,
  active = false,
  pending = false,
}: {
  onSwitchToSelf: SwitchHandler;
  compact?: boolean;
  active?: boolean;
  pending?: boolean;
}) {
  return (
    <SwitchBuilderControl target="self" onSwitch={onSwitchToSelf} compact={compact} active={active} pending={pending} />
  );
}

/**
 * Connect card for a self-build round waiting on the creator's own coding agent (BY-27b / BY-18c).
 *
 * Step 1: one-click install (Cursor / VS Code, credential-free) and/or paste MCP config —
 * or choose OAuth sign-in. Deep links carry the server URL only; never a credential.
 * Step 2: paste the keyless kickoff prompt (slug only; never a secret).
 * The full Authorization value is held in memory for Copy and never rendered.
 */
export function StudioConnectCard({
  token,
  agentConnected = false,
  mode = 'setup',
  collapsible = true,
  hideIfUnavailable = false,
  unavailableLabel,
  onOpenInstall,
  density = 'thread',
  panelHeading,
  onSwitchToPlatform,
  builderHandoffPending = false,
  waitingCaptionElsewhere = false,
  platformUnavailable,
}: StudioConnectCardProps) {
  const isPanel = density === 'panel';
  const { t, i18n } = useTranslation();
  const baseId = useId();
  const authHeaderRef = useRef<string | null>(null);
  const [payload, setPayload] = useState<ConnectPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<ConnectClient>('claudeCode');
  const [authMode, setAuthMode] = useState<ConnectAuthMode>(() => loadAuthMode());
  const [copied, setCopied] = useState<'config' | 'kickoff' | null>(null);
  const [rotateArmed, setRotateArmed] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(() => (collapsible ? isConnectCollapsed(token) : false));

  const isResume = mode === 'resume';

  useEffect(() => {
    setCollapsed(collapsible ? isConnectCollapsed(token) : false);
  }, [token, collapsible]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setUnavailable(false);
    getConnectPayload(token)
      .then((next) => {
        if (!cancelled) {
          authHeaderRef.current = next.authorizationHeader;
          setPayload(next);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const apiErr = err as ConnectApiError;
        // Details mounts us for every open draft — stay quiet only when the round is
        // plainly not a self connect (platform / inactive). missing_slug and other
        // 409s still surface so a broken self round is not silently empty.
        if (
          hideIfUnavailable &&
          apiErr.message === 'connect_unavailable' &&
          apiErr.reason != null &&
          QUIET_UNAVAILABLE.has(apiErr.reason)
        ) {
          setUnavailable(true);
          setLoading(false);
          return;
        }
        setError(t('connect.loadError'));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, t, hideIfUnavailable]);

  if (agentConnected) {
    return null;
  }
  if (unavailable) {
    return unavailableLabel ? <p className="studio-rail-empty">{unavailableLabel}</p> : null;
  }

  const hideCard = () => {
    setConnectCollapsed(token, true);
    setCollapsed(true);
    recordStudioStep('connect_dismissed', 'self');
  };

  const showCard = () => {
    setConnectCollapsed(token, false);
    setCollapsed(false);
    recordStudioStep('connect_restored', 'self');
  };

  if (collapsible && collapsed && !loading && !error) {
    return (
      <aside
        className="studio-connect is-collapsed"
        aria-label={t('connect.collapsed.title')}
        data-connect-mode={mode}
        data-testid="connect-collapsed"
      >
        {waitingCaptionElsewhere ? null : (
          <p className="studio-connect-waiting" aria-live="polite">
            <span className="studio-connect-pulse" aria-hidden="true" />
            {isResume ? t('connect.resume.waiting') : t('connect.waiting')}
          </p>
        )}
        <div className="studio-connect-collapsed-actions">
          <button type="button" className="studio-connect-show" onClick={showCard} data-testid="connect-show">
            <PixelIcon name="expand" size={12} /> {t('connect.show')}
          </button>
          {payload?.canSwitchToPlatform && onSwitchToPlatform ? (
            <SwitchToPlatformControl
              compact
              onSwitchToPlatform={onSwitchToPlatform}
              pending={builderHandoffPending}
              unavailable={platformUnavailable}
            />
          ) : null}
          <span className="studio-connect-collapsed-hint">{t('connect.collapsed.hint')}</span>
        </div>
      </aside>
    );
  }

  const chooseAuthMode = (next: ConnectAuthMode) => {
    setAuthMode(next);
    saveAuthMode(next);
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
    // Claude/Kimi/CLI embed the full "Authorization: Bearer …" line; Codex/Cursor
    // embed only "Bearer …" — replace both forms so Copy never leaves the mask.
    const masked = payload.authorizationHeaderMasked;
    const maskedBearer = masked.replace(/^Authorization:\s*/i, '').trim();
    const realBearer = header.replace(/^Authorization:\s*/i, '').trim();
    let realSnippet = payload.installSnippets[client].split(masked).join(header);
    if (maskedBearer && maskedBearer !== masked) {
      realSnippet = realSnippet.split(maskedBearer).join(realBearer);
    }
    await copyText(realSnippet, 'config');
  };

  /** One-click install — URL only; never a credential. Separate from connect_copied. */
  const recordDeeplinkClick = (clientId: 'cursor' | 'vscode') => {
    recordStudioStep('connect_deeplink', 'self', clientId);
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
  const installLinks = payload?.installLinks;
  const showInstallLinks = Boolean(installLinks?.cursor && installLinks?.vscode);

  const installLinksBlock =
    showInstallLinks && installLinks ? (
      <>
        <p className="studio-connect-same">{t('connect.installLinks.hint')}</p>
        <div className="studio-connect-install-links" data-testid="connect-install-links">
          <a
            className="studio-connect-install-link"
            href={installLinks.cursor}
            data-testid="connect-install-cursor"
            onClick={() => recordDeeplinkClick('cursor')}
          >
            {t('connect.installLinks.cursor')}
          </a>
          <a
            className="studio-connect-install-link"
            href={installLinks.vscode}
            data-testid="connect-install-vscode"
            onClick={() => recordDeeplinkClick('vscode')}
          >
            {t('connect.installLinks.vscode')}
          </a>
        </div>
      </>
    ) : null;

  const installPanel: ReactNode = payload ? (
    <>
      <div className="studio-connect-tabs" role="tablist" aria-label={t('connect.authMode.label')}>
        <button
          type="button"
          role="tab"
          aria-selected={authMode === 'oauth'}
          className={`studio-connect-tab${authMode === 'oauth' ? ' is-active' : ''}`}
          onClick={() => chooseAuthMode('oauth')}
        >
          {t('connect.authMode.oauth')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={authMode === 'key'}
          className={`studio-connect-tab${authMode === 'key' ? ' is-active' : ''}`}
          onClick={() => chooseAuthMode('key')}
        >
          {t('connect.authMode.key')}
        </button>
      </div>

      {authMode === 'key' ? (
        <div className="studio-connect-step">
          <div className="studio-connect-step-head">
            {!isResume && !isPanel ? (
              <span className="studio-connect-step-num" aria-hidden="true">
                1
              </span>
            ) : null}
            <h4 className="studio-connect-step-title">{t('connect.step1.title')}</h4>
          </div>
          {installLinksBlock}
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
            {!isResume && !isPanel ? (
              <span className="studio-connect-step-num" aria-hidden="true">
                1
              </span>
            ) : null}
            <h4 className="studio-connect-step-title">{t('connect.oauth.title')}</h4>
          </div>
          {installLinksBlock}
          <p className="studio-connect-same">{t('connect.oauth.hint')}</p>
          <pre className="studio-connect-snippet" tabIndex={0}>
            {payload.mcpUrl}
          </pre>
          <div className="studio-connect-actions">
            <button type="button" className="status-share-copy" onClick={() => void copyText(payload.mcpUrl, 'config')}>
              <PixelIcon name={copied === 'config' ? 'check' : 'sparkle'} size={12} />{' '}
              {copied === 'config' ? t('connect.copied') : t('connect.copyUrl')}
            </button>
          </div>
        </div>
      )}
    </>
  ) : null;

  const kickoffPanel: ReactNode = payload ? (
    <div className="studio-connect-step">
      <div className="studio-connect-step-head">
        {!isResume && !isPanel ? (
          <span className="studio-connect-step-num" aria-hidden="true">
            2
          </span>
        ) : null}
        <h4 className="studio-connect-step-title">
          {isResume ? t('connect.resume.kickoffTitle') : t('connect.step2.title')}
        </h4>
      </div>
      <p className="studio-connect-same">
        {isResume ? t('connect.resume.kickoffHint') : t('connect.step2.sameConnection')}
      </p>
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
  ) : null;

  const kickoffDisclosure =
    payload && !loading ? (
      <details className="studio-connect-setup-details" data-testid="connect-kickoff-details">
        <summary>{t('studioPanel.rail.kickoffDetails')}</summary>
        <div className="studio-connect-setup-body">{kickoffPanel}</div>
      </details>
    ) : null;

  const card = (
    <section
      className={`studio-connect${error ? ' is-error' : ''}${isResume ? ' is-resume' : ''}${isPanel ? ' is-panel' : ''}`}
      aria-labelledby={isPanel && panelHeading ? `${baseId}-panel` : isPanel ? undefined : `${baseId}-title`}
      aria-label={isPanel && !panelHeading ? (isResume ? t('connect.resume.title') : t('connect.title')) : undefined}
      data-connect-mode={mode}
      data-density={density}
      data-testid="connect-expanded"
    >
      {isPanel && panelHeading ? (
        <h4 id={`${baseId}-panel`} className="studio-rail-section-title">
          {panelHeading}
        </h4>
      ) : null}
      {!isPanel ? (
        <div className="studio-connect-title-row">
          <h3 id={`${baseId}-title`} className="studio-connect-title">
            {isResume ? t('connect.resume.title') : t('connect.title')}
          </h3>
          {collapsible && !error ? (
            <button
              type="button"
              className="studio-connect-hide"
              onClick={hideCard}
              data-testid="connect-hide"
              title={t('connect.hide')}
            >
              <PixelIcon name="close" size={11} /> {t('connect.hide')}
            </button>
          ) : null}
        </div>
      ) : null}
      {/* Lead is setup guidance — drop it once we only have an error, so a phone foot/thread
          is not mostly paragraph + red line. Panel density skips it: the rail section heading
          already names the job. */}
      {!error && !isPanel ? (
        <p className="studio-connect-lead">{isResume ? t('connect.resume.lead') : t('connect.lead')}</p>
      ) : null}

      {loading ? <p className="studio-connect-state">{t('connect.loading')}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {payload?.canSwitchToPlatform && onSwitchToPlatform ? (
        <SwitchToPlatformControl
          onSwitchToPlatform={onSwitchToPlatform}
          pending={builderHandoffPending}
          unavailable={platformUnavailable}
        />
      ) : null}

      {payload && !loading ? (
        isPanel ? (
          <>
            {installPanel}
            {kickoffDisclosure}
          </>
        ) : isResume ? (
          <>
            {kickoffPanel}
            {onOpenInstall ? (
              <button
                type="button"
                className="studio-connect-open-install"
                onClick={onOpenInstall}
                data-testid="connect-open-install"
              >
                <PixelIcon name="expand" size={12} /> {t('connect.resume.openInstall')}
              </button>
            ) : (
              <>
                {waitingCaptionElsewhere ? null : (
                  <p className="studio-connect-waiting" aria-live="polite">
                    <span className="studio-connect-pulse" aria-hidden="true" />
                    {t('connect.resume.waiting')}
                  </p>
                )}
                <details className="studio-connect-setup-details" data-testid="connect-setup-details">
                  <summary>{t('connect.resume.setupDetails')}</summary>
                  <div className="studio-connect-setup-body">{installPanel}</div>
                </details>
              </>
            )}
          </>
        ) : onOpenInstall ? (
          <>
            <button
              type="button"
              className="studio-connect-open-install is-primary"
              onClick={onOpenInstall}
              data-testid="connect-open-install"
            >
              <PixelIcon name="expand" size={12} /> {t('connect.openInstall')}
            </button>
            {kickoffPanel}
          </>
        ) : (
          <>
            {installPanel}
            {kickoffPanel}
            {waitingCaptionElsewhere ? null : (
              <p className="studio-connect-waiting" aria-live="polite">
                <span className="studio-connect-pulse" aria-hidden="true" />
                {t('connect.waiting')}
              </p>
            )}
          </>
        )
      ) : null}

      {/* End-of-card dismiss: the title-row chip is easy to miss once the title wraps on
          a phone; readers finish at the waiting line and need a clear exit there. */}
      {collapsible && !error && payload && !loading ? (
        <div className="studio-connect-foot-dismiss">
          <button
            type="button"
            className="studio-connect-hide is-foot"
            onClick={hideCard}
            data-testid="connect-hide-foot"
          >
            <PixelIcon name="close" size={11} /> {t('connect.hide')}
          </button>
        </div>
      ) : null}
    </section>
  );

  if (isPanel) {
    return <div className="studio-rail-section">{card}</div>;
  }
  return card;
}

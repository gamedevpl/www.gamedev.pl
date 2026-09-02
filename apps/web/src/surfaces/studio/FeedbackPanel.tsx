import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BuilderModeBadge } from '../../BuilderModeBadge.js';
import type { BuilderUnavailableReason } from '../../BuilderChoice.js';
import { saveLastBuilder, type BuilderKind } from '../../builderKind.js';
import { PixelIcon } from '../../PixelIcon.js';
import { submitFeedback, type SubmissionStatus } from '../../submissionApi.js';
import { selfComposerRoute } from '../../selfBuildCopy.js';
import { SwitchToPlatformControl, SwitchToSelfControl } from './StudioConnectCard.js';
import { submitImprovement } from '../../studioApi.js';
import { recordStudioStep } from '../../visitTelemetry.js';
import { toBase64PngList } from '../../attachmentImages.js';
import { useComposerAttachments } from './composerAttachments.js';
import { CompactFeedbackComposer } from './CompactFeedbackComposer.js';
import './status-feedback.css';
import './status-composer.css';

export type BuilderHandoffHandler = () => Promise<void | { pending?: boolean }> | void | { pending?: boolean };

const SENT_RECEIPT_MS = 4500;

// Revision loop: the creator's feedback queues into the agent's inbox.

// Shown only while building or needs-changes — published games use /improve instead.

// `building`: no draft exists yet, so the ask is a course correction.
export function FeedbackPanel({
  token,
  published,
  building,
  agentWorking = false,
  compact = false,
  chooseBuilder = false,
  initialBuilder = 'platform',
  roundBuilder,
  stall,
  failureReason,
  phase,
  suppressRouteNote = false,
  onSwitchToPlatform,
  onSwitchToSelf,
  handoffPending,
  platformUnavailable,
  onSent,
  onPublishedImprove,
  draft,
  onDraftConsumed,
}: {
  token: string;
  // Live-game improvement, or an in-progress build change.
  published: boolean;
  building: boolean;
  agentWorking?: boolean;
  // Thread reply box, not a page section: field and send, nothing else.
  compact?: boolean;
  // Show builder choice — the next send opens a new round.
  chooseBuilder?: boolean;
  initialBuilder?: BuilderKind;
  // Builder of the *current* round — drives self-build routing copy.
  roundBuilder?: BuilderKind;
  stall?: SubmissionStatus['stall'];
  failureReason?: string;
  // Internal job phase — gate-green drafts need honest "start your agent" routing.
  phase?: SubmissionStatus['phase'];
  onSwitchToPlatform?: BuilderHandoffHandler;
  onSwitchToSelf?: BuilderHandoffHandler;
  handoffPending?: BuilderKind;
  // Why platform is unavailable, if it is. See BuilderChoice.
  platformUnavailable?: BuilderUnavailableReason;
  // Hides "saved until you start your agent" — connect card already said it.
  suppressRouteNote?: boolean;
  onSent: (text: string) => void;
  // A published improvement opens a new job and moves the view.

  // Only fires when published; a draft revision stays on this thread.
  onPublishedImprove?: (token: string) => void;
  draft?: { text: string; seq: number } | null;
  onDraftConsumed?: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [quickActionDismissed, setQuickActionDismissed] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  // Sent but no round started — its own slot, distinct from error.

  // Nothing failed; the note stays visible until the next round reads it.
  const [notice, setNotice] = useState<string | null>(null);
  const [builder, setBuilder] = useState<BuilderKind>(initialBuilder);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const sending = state === 'sending';
  const attachmentsApi = useComposerAttachments(sending);
  const { attachments, pendingAttachmentReads, resetAttachments } = attachmentsApi;

  useEffect(() => {
    setBuilder(initialBuilder);
  }, [initialBuilder, token]);

  useEffect(() => {
    if (!draft) return;
    setText(draft.text);
    onDraftConsumed?.();
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.seq]);

  // Runs after `text` commits, so a seeded draft measures its real height.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    if (text.length === 0) {
      input.style.height = '';
      return;
    }
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 220)}px`;
  }, [text]);

  useEffect(() => {
    setStopRequested(handoffPending === 'self');
  }, [handoffPending, token]);

  useEffect(() => {
    setQuickActionDismissed(false);
  }, [failureReason, token]);

  // A receipt, not furniture — clears itself so the box returns.

  // Typing also clears it; this timer covers watching the thread after send.
  useEffect(() => {
    if (state !== 'sent') return;
    const timer = window.setTimeout(() => setState('idle'), SENT_RECEIPT_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  const trimmed = text.trim();
  // Choosing a builder: the selector is the truth for a new round.

  // Otherwise the current round's builder drives the routing note.
  const routeBuilder = chooseBuilder ? builder : roundBuilder;
  const composerRoute = selfComposerRoute({
    builder: routeBuilder,
    stall: chooseBuilder ? null : stall,
    failureReason: chooseBuilder ? null : failureReason,
    phase: chooseBuilder ? null : phase,
  });
  const sentSelfKey =
    composerRoute === 'active'
      ? 'statusView.feedback.sentSelfActive'
      : composerRoute === 'waiting'
        ? 'statusView.feedback.sentSelfWaiting'
        : null;
  // Active self rounds already imply a listening agent — repeating it is noise.

  // Waiting still needs a note: read only once they restart their agent.

  // Unless suppressRouteNote — the connect card above already said it.
  const routeNoteKey =
    !suppressRouteNote && composerRoute === 'waiting' ? 'statusView.feedback.routeSelfWaiting' : null;

  // Grows with typing, replacing the old resize grip in the box.

  // Capped height: a long message scrolls instead of pushing the page.
  const autoGrow = () => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 220)}px`;
  };

  const send = async (requestedText: string = trimmed) => {
    const message = requestedText.trim();
    if (message.length < 10 || state === 'sending' || pendingAttachmentReads > 0) return;
    setState('sending');
    setError(null);
    setNotice(null);
    // Shows Sending for the whole round trip — never abort the fetch.

    // Aborting doesn't cancel the Fastify handler — risks a duplicate dispatch.

    // Send stays disabled until the server call actually returns.
    try {
      const roundBuilder = chooseBuilder ? builder : undefined;
      // Normalized to PNG for the backend's signature check.
      let context: { referenceImages: string[] } | undefined;
      if (attachments.length > 0) {
        const referenceImages = await toBase64PngList(attachments.map((a) => a.dataUrl));
        if (referenceImages.length > 0) context = { referenceImages };
      }
      // New job from an improvement hands the thread over once ready.
      let handoffToken: string | undefined;
      // Same box, different destination — decided from the server's reported state.

      // Shortest call shape for the ordinary case; tests assert on it.
      if (published) {
        const improved = roundBuilder
          ? await submitImprovement(token, message, context, roundBuilder)
          : context
            ? await submitImprovement(token, message, context)
            : await submitImprovement(token, message);
        // Publishing is terminal — the improvement is a new job, new token.

        // Builder memory is keyed by token — persist it under the new one.
        handoffToken = improved.token;
      } else {
        const result = roundBuilder
          ? await submitFeedback(token, message, context, roundBuilder)
          : context
            ? await submitFeedback(token, message, context)
            : await submitFeedback(token, message);
        if (result.roundStarted === false) {
          setNotice(
            result.reason === 'no_capacity' ? t('statusView.feedback.noCapacity') : t('statusView.feedback.notStarted'),
          );
        }
      }
      if (roundBuilder) {
        // Published improve moved to a new token; save the choice there too.
        saveLastBuilder(handoffToken ?? token, roundBuilder);
        recordStudioStep('builder_chosen', roundBuilder);
      }
      setState('sent');
      setText('');
      resetAttachments();
      // Reset to CSS height — not the sent message's grown size.
      if (inputRef.current) inputRef.current.style.height = '';
      // Echoes locally now; the next status poll picks up the real state.
      onSent(message);
      // Moves onto the new thread last, after the receipt and echo commit.
      if (handoffToken) onPublishedImprove?.(handoffToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'content_rejected') {
        setError(t('errors.contentRejected.other'));
      } else if (message.includes('quota')) {
        setError(t('statusView.feedback.quota'));
      } else if (message.includes('published')) {
        setError(t('statusView.feedback.published'));
      } else {
        setError(t('statusView.feedback.error'));
      }
      setState('idle');
    }
  };

  const sendDebugCi = () => {
    setQuickActionDismissed(true);
    void send(t('statusView.feedback.debugCiPrompt'));
  };

  const handleBuilderChange = (next: BuilderKind) => {
    setBuilder(next);
  };

  // Three states, one box — copy alone shows where the message will go.
  const hintKey = published
    ? 'statusView.feedback.hintPublished'
    : building
      ? 'statusView.feedback.hintBuilding'
      : 'statusView.feedback.hint';
  const titleKey = published
    ? 'statusView.feedback.titlePublished'
    : building
      ? 'statusView.feedback.titleBuilding'
      : 'statusView.feedback.title';
  // Composer uses a shorter hint — the full paragraph clipped on phone placeholders.

  // Worse in Polish (longer); placeholder now just says where it goes.
  const composerHintKey = published
    ? 'statusView.feedback.composerHintPublished'
    : building
      ? 'statusView.feedback.composerHintBuilding'
      : 'statusView.feedback.composerHint';

  // Sticky builder badge (Claude/Cursor shape): visible when choosable or mid-flight.

  // Handoff controls live here too; the transcript stays status-only.
  const effectiveBuilder = chooseBuilder ? builder : (roundBuilder ?? builder);
  const showBuilderBadge =
    chooseBuilder || effectiveBuilder === 'self' || Boolean(onSwitchToSelf) || (agentWorking && Boolean(roundBuilder));
  const builderSelector = showBuilderBadge ? (
    <BuilderModeBadge
      value={effectiveBuilder}
      onChange={handleBuilderChange}
      canChange={chooseBuilder}
      disabled={sending || agentWorking}
      platformUnavailable={platformUnavailable}
    />
  ) : null;
  const activeSelfHandoff =
    !chooseBuilder && effectiveBuilder === 'self' && onSwitchToPlatform && !sending ? (
      <SwitchToPlatformControl
        compact
        active
        onSwitchToPlatform={onSwitchToPlatform}
        pending={handoffPending === 'platform'}
        unavailable={platformUnavailable}
      />
    ) : null;
  const showStop =
    !chooseBuilder && agentWorking && effectiveBuilder === 'platform' && Boolean(onSwitchToSelf) && !stopRequested;
  // Hide the switch-to-self badge while STOP covers the same action.
  const activePlatformHandoff =
    !chooseBuilder && effectiveBuilder === 'platform' && onSwitchToSelf && !showStop && !sending ? (
      <SwitchToSelfControl compact active onSwitchToSelf={onSwitchToSelf} pending={stopRequested} />
    ) : null;
  const stopAndSwitchToSelf = async () => {
    if (!onSwitchToSelf) return;
    setError(null);
    setStopRequested(true);
    try {
      const result = await onSwitchToSelf();
      recordStudioStep('builder_chosen', 'self');
      return result;
    } catch {
      setStopRequested(false);
      setError(t('connect.switchBuilder.error'));
    }
  };
  const builderControls = (
    <div className="builder-mode-controls">
      {builderSelector}
      {activeSelfHandoff}
      {activePlatformHandoff}
    </div>
  );

  // Standalone status page shows a receipt next to Send; studio doesn't.

  // Studio echoes into the thread already — a second Sent! would repeat it.
  const sentReceipt =
    state === 'sent' && !notice && !error ? (
      <div className="status-feedback-receipt" role="status">
        <span className="status-feedback-sent">
          <PixelIcon name="check" size={13} />
          <span className="status-feedback-sent-text">{t(sentSelfKey ?? 'statusView.feedback.sent')}</span>
        </span>
        <button
          type="button"
          className="status-feedback-receipt-dismiss"
          onClick={() => setState('idle')}
          aria-label={t('statusView.feedback.dismissSent')}
        >
          <PixelIcon name="close" size={11} />
        </button>
      </div>
    ) : null;

  // Compact composer: field above, builder/send toolbar below.

  // is-empty: placeholder and send share one row.
  if (compact) {
    return (
      <CompactFeedbackComposer
        text={text}
        onTextChange={(value) => {
          setText(value);
          if (state === 'sent') setState('idle');
        }}
        inputRef={inputRef}
        autoGrow={autoGrow}
        onSend={() => void send()}
        trimmed={trimmed}
        sending={sending}
        error={error}
        notice={notice}
        isSent={state === 'sent'}
        failureReason={failureReason}
        quickActionDismissed={quickActionDismissed}
        onSendDebugCi={sendDebugCi}
        routeNoteKey={routeNoteKey}
        composerHintKey={composerHintKey}
        titleKey={titleKey}
        attachmentsApi={attachmentsApi}
        builderControls={builderControls}
        showStop={showStop}
        stopRequested={stopRequested}
        onStopAndSwitchToSelf={() => void stopAndSwitchToSelf()}
      />
    );
  }

  return (
    <div className="status-feedback status-composer">
      <h3 className="status-feedback-title">{t(titleKey)}</h3>
      <p className="status-feedback-hint">{t(hintKey)}</p>
      {builderSelector ? <div className="builder-mode-row">{builderControls}</div> : null}
      {routeNoteKey && state !== 'sent' && !error && !notice ? (
        <p className="status-feedback-route">{t(routeNoteKey)}</p>
      ) : null}
      {failureReason === 'gate_red' && !quickActionDismissed && state !== 'sending' ? (
        <div className="status-feedback-quick-actions">
          <button type="button" className="status-feedback-quick-action" onClick={sendDebugCi}>
            <PixelIcon name="wrench" size={12} />
            {t('statusView.feedback.debugCi')}
          </button>
        </div>
      ) : null}
      <textarea
        className="status-feedback-input"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          if (state === 'sent') setState('idle');
        }}
        placeholder={t('statusView.feedback.placeholder')}
        rows={3}
        maxLength={2000}
      />
      <div className="status-feedback-actions">
        <button
          className="primary-btn"
          onClick={() => void send()}
          disabled={state === 'sending' || trimmed.length < 10}
        >
          {state === 'sending' ? t('statusView.feedback.sending') : t('statusView.feedback.submit')}
        </button>
        {sentReceipt}
      </div>
      {error ? <p className="error">{error}</p> : null}
      {notice && !error ? <p className="status-feedback-notice">{notice}</p> : null}
    </div>
  );
}

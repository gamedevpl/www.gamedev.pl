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

/**
 * Revision loop: the creator describes what to change. The feedback is relayed to the
 * build agent (POST .../feedback), which queues it into the agent's inbox as a message
 * explicitly marked as data-not-instructions, so the agent picks it up on its next report.
 * Shown while the game is still in progress (or needs changes) — a published game can't be
 * revised here.
 *
 * `building` swaps the copy for the stretch before a playable draft exists: there is
 * nothing to have "played" yet, and the useful ask is a course correction rather than a
 * revision.
 */
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
  /** Routes the message: an improvement on the live game, or a change on the build. */
  published: boolean;
  building: boolean;
  agentWorking?: boolean;
  /** The thread's reply box rather than a page section — field and send, nothing else. */
  compact?: boolean;
  /** Show builder choice — the next send opens a new round. */
  chooseBuilder?: boolean;
  initialBuilder?: BuilderKind;
  /** Builder of the *current* round — drives self-build routing copy. */
  roundBuilder?: BuilderKind;
  stall?: SubmissionStatus['stall'];
  failureReason?: string;
  /** Internal job phase — gate-green drafts need honest "start your agent" routing. */
  phase?: SubmissionStatus['phase'];
  onSwitchToPlatform?: BuilderHandoffHandler;
  onSwitchToSelf?: BuilderHandoffHandler;
  handoffPending?: BuilderKind;
  // Why platform is unavailable, if it is. See BuilderChoice.
  platformUnavailable?: BuilderUnavailableReason;
  /**
   * Hide the "saved until you start your agent" line — the connect card above already
   * says we are waiting, so a third copy under the box is noise.
   */
  suppressRouteNote?: boolean;
  onSent: (text: string) => void;
  /**
   * A published-game improvement opened a new job; called with its token so the view
   * can move the creator onto the new build thread. Only fires on the `published`
   * path — a draft revision continues the current round and stays on this thread.
   */
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
  // Sent, kept, and *not* acted on: the API took the message but no round started behind
  // it. Its own slot rather than `error`, because nothing failed on the creator's side and
  // there is nothing for them to redo — the note is safe and will be read by the next
  // round. Without this the composer says "sent" and the thread then says nothing for
  // hours, which is exactly how an exhausted agent allowance reads as a hung game.
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

  // A receipt is confirmation, not furniture: clear it on its own so the composer returns
  // to one row. Typing also clears it (below); the timer covers the common case where the
  // creator just watches the thread after send.
  useEffect(() => {
    if (state !== 'sent') return;
    const timer = window.setTimeout(() => setState('idle'), SENT_RECEIPT_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  const trimmed = text.trim();
  // When choosing a builder for a new round, the selector is the truth; otherwise the
  // current round's builder drives the honest self-build routing note.
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
  // Active self rounds already imply a listening agent — repeating that above the
  // box is chrome noise (the placeholder covers "what to write"). Waiting is the
  // case that still needs a sentence: the note will not be read until they start
  // their agent again — unless the connect card already said that (`suppressRouteNote`).
  const routeNoteKey =
    !suppressRouteNote && composerRoute === 'waiting' ? 'statusView.feedback.routeSelfWaiting' : null;

  // The composer grows with what is typed, which is what replaced the resize grip: once
  // the send button moved inside the box, a drag handle in the middle of its right edge
  // read as a rendering fault. Capped, so a long message scrolls instead of pushing the
  // conversation off the top of the screen.
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
    // Show "Sending…" for the whole HTTP round trip. Do **not** abort the fetch from
    // the browser: aborting does not cancel the Fastify handler, so a timed-out UI that
    // re-enabled Send could dispatch a second improve/feedback while the first was still
    // finishing (double job, double quota, round token invalidated). The agent-tasks
    // client bounds the server call; this button stays disabled until that answer lands.
    try {
      const roundBuilder = chooseBuilder ? builder : undefined;
      // Normalized to PNG for the backend's signature check.
      let context: { referenceImages: string[] } | undefined;
      if (attachments.length > 0) {
        const referenceImages = await toBase64PngList(attachments.map((a) => a.dataUrl));
        if (referenceImages.length > 0) context = { referenceImages };
      }
      // The new job an improvement opened, if this send was one — the thread hands over
      // to it once the local echo and receipt are in place, below.
      let handoffToken: string | undefined;
      // Same box, same act, different destination — decided here from the state the
      // server reported rather than by asking the creator which one they meant.
      // Shortest call shape for the ordinary case — tests assert on it.
      if (published) {
        const improved = roundBuilder
          ? await submitImprovement(token, message, context, roundBuilder)
          : context
            ? await submitImprovement(token, message, context)
            : await submitImprovement(token, message);
        // Publishing is terminal: the improvement is a new job with its own token. The
        // builder memory is keyed by token in localStorage, so persist the choice under
        // the *new* token as well — the old token's memory dies with its round.
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
        // A published improve moved to a new token; save the choice there too so the new
        // build thread's composer/connect defaults to it before its status echoes back.
        saveLastBuilder(handoffToken ?? token, roundBuilder);
        recordStudioStep('builder_chosen', roundBuilder);
      }
      setState('sent');
      setText('');
      resetAttachments();
      // Back to the CSS height rather than the height the sent message grew it to: an
      // empty box the size of the last paragraph is a leftover, not a state.
      if (inputRef.current) inputRef.current.style.height = '';
      // Echo it into the activity feed straight away: the API only sees it once the
      // comment round-trips through GitHub, which is a poll or two away.
      onSent(message);
      // Then move the creator onto the new build thread. Last, so the receipt and the
      // local echo are already committed before the thread this box lives in is swapped.
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

  // Three states, one box. The copy is the only thing that changes, and it changes so
  // the creator can see where their message is about to go without having chosen.
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
  // The composer gets its own, much shorter version of the same three hints. The
  // paragraph reads fine above a page; as placeholder text on a phone it ran to four
  // lines and the box clipped the last of them mid-word — worse in Polish, where the
  // same sentence is longer. The placeholder now says where the message goes and stops.
  const composerHintKey = published
    ? 'statusView.feedback.composerHintPublished'
    : building
      ? 'statusView.feedback.composerHintBuilding'
      : 'statusView.feedback.composerHint';

  // Sticky builder signal in the composer toolbar (Claude/Cursor shape): always when
  // the next send can choose, and while a round is mid-flight so routing stays visible.
  // Handoff controls live here too; the transcript remains status-only.
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

  // Standalone status page still shows a brief receipt next to Send. The studio
  // composer does not: the message is echoed into the thread immediately, so a
  // second "Sent!" under the box is the same confirmation twice.
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
  // Empty (`is-empty`): placeholder and send share one row.
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

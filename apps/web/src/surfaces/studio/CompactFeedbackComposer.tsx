import type { MutableRefObject, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from '../../PixelIcon.js';
import { SketchModal } from '../../SketchModal.js';
import { MAX_COMPOSER_ATTACHMENTS, type ComposerAttachmentsApi } from './composerAttachments.js';

interface CompactFeedbackComposerProps {
  text: string;
  onTextChange: (value: string) => void;
  inputRef: MutableRefObject<HTMLTextAreaElement | null>;
  autoGrow: () => void;
  onSend: () => void;
  trimmed: string;
  sending: boolean;
  error: string | null;
  notice: string | null;
  isSent: boolean;
  failureReason?: string;
  quickActionDismissed: boolean;
  onSendDebugCi: () => void;
  routeNoteKey: string | null;
  composerHintKey: string;
  titleKey: string;
  attachmentsApi: ComposerAttachmentsApi;
  builderControls: ReactNode;
  showStop: boolean;
  stopRequested: boolean;
  onStopAndSwitchToSelf: () => void;
}

// The studio thread's reply box: field and send, nothing else — see FeedbackPanel for the
// shared state and send logic this renders. Split out because it is a distinct, self-contained
// UI shape from the full-page composer, not a variant of the same markup.
export function CompactFeedbackComposer({
  text,
  onTextChange,
  inputRef,
  autoGrow,
  onSend,
  trimmed,
  sending,
  error,
  notice,
  isSent,
  failureReason,
  quickActionDismissed,
  onSendDebugCi,
  routeNoteKey,
  composerHintKey,
  titleKey,
  attachmentsApi,
  builderControls,
  showStop,
  stopRequested,
  onStopAndSwitchToSelf,
}: CompactFeedbackComposerProps) {
  const { t } = useTranslation();
  const {
    attachments,
    pendingAttachmentReads,
    attachMenuOpen,
    setAttachMenuOpen,
    setIsSketchOpen,
    fileInputRef,
    attachMenuRef,
    attachPanelRef,
    handleAttachFiles,
    removeAttachment,
    isSketchOpen,
    handleSaveSketch,
  } = attachmentsApi;
  const empty = text.length === 0;
  return (
    <div
      className={`status-feedback status-composer is-compact${empty ? ' is-empty' : ''}${sending ? ' is-sending' : ''}`}
      aria-busy={sending || undefined}
      onClick={(event) => {
        // Clicking card chrome focuses the textarea; skip real controls.
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest('button, a, textarea, input, select, [role="button"]')) return;
        inputRef.current?.focus();
      }}
    >
      {failureReason === 'gate_red' && !quickActionDismissed && !sending ? (
        <div className="status-feedback-quick-actions">
          <button type="button" className="status-feedback-quick-action" onClick={onSendDebugCi}>
            <PixelIcon name="wrench" size={12} />
            {t('statusView.feedback.debugCi')}
          </button>
        </div>
      ) : null}
      {routeNoteKey && !sending && !isSent && !error && !notice ? (
        <p className="status-feedback-route">{t(routeNoteKey)}</p>
      ) : null}
      <textarea
        ref={inputRef}
        className="status-feedback-input"
        value={text}
        onChange={(event) => {
          onTextChange(event.target.value);
          autoGrow();
        }}
        onKeyDown={(event) => {
          // Enter sends; Shift+Enter keeps a newline (same as RemixAsk).
          // Skip while IME is composing — Enter confirms a candidate there.
          const native = event.nativeEvent;
          if (event.key !== 'Enter' || event.shiftKey || native.isComposing || native.keyCode === 229) {
            return;
          }
          event.preventDefault();
          onSend();
        }}
        onPaste={(event) => {
          const pastedImages = Array.from(event.clipboardData?.items ?? [])
            .filter((item) => item.type.startsWith('image/'))
            .map((item) => item.getAsFile())
            .filter((file): file is File => file !== null);
          if (pastedImages.length > 0) handleAttachFiles(pastedImages);
        }}
        placeholder={t(composerHintKey)}
        aria-label={t(titleKey)}
        rows={1}
        maxLength={2000}
        disabled={sending}
      />
      {attachments.length > 0 && (
        <div className="status-composer-attachments">
          {attachments.map((item) => (
            <div key={item.id} className="status-composer-attachment-chip">
              <img src={item.dataUrl} alt={item.name} className="status-composer-attachment-thumb" />
              <button
                type="button"
                className="status-composer-attachment-remove"
                onClick={() => removeAttachment(item.id)}
                title={t('hero.removeAttachment')}
                disabled={sending}
              >
                <PixelIcon name="close" size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="status-composer-toolbar">
        <div className="status-composer-toolbar-left">
          <div className="status-composer-attach" ref={attachMenuRef}>
            <button
              type="button"
              className={`status-composer-attach-btn${attachMenuOpen ? ' is-open' : ''}`}
              onClick={() => setAttachMenuOpen((open) => !open)}
              title={t('hero.attachMenuAria')}
              aria-label={t('hero.attachMenuAria')}
              aria-expanded={attachMenuOpen}
              aria-haspopup="menu"
              disabled={sending || attachments.length >= MAX_COMPOSER_ATTACHMENTS}
            >
              <PixelIcon name="plus" size={15} />
            </button>
            {attachMenuOpen && !sending ? (
              <div className="prompt-attach-menu" role="menu" aria-label={t('hero.attachMenu')} ref={attachPanelRef}>
                <button
                  type="button"
                  className="prompt-attach-item"
                  role="menuitem"
                  onClick={() => {
                    setAttachMenuOpen(false);
                    fileInputRef.current?.click();
                  }}
                >
                  <PixelIcon name="image" size={16} /> {t('hero.uploadImage')}
                </button>
                <button
                  type="button"
                  className="prompt-attach-item"
                  role="menuitem"
                  onClick={() => {
                    setAttachMenuOpen(false);
                    setIsSketchOpen(true);
                  }}
                >
                  <PixelIcon name="palette" size={16} /> {t('hero.drawSketch')}
                </button>
              </div>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden-file-input"
              onChange={(event) => {
                if (event.target.files && event.target.files.length > 0) {
                  handleAttachFiles(event.target.files);
                  event.target.value = '';
                }
              }}
            />
          </div>
          {builderControls}
        </div>
        <div className="status-composer-toolbar-right">
          {sending && !showStop ? (
            <span className="status-feedback-sending" role="status">
              {t('statusView.feedback.sending')}
            </span>
          ) : null}
          {showStop ? (
            <button
              type="button"
              className="status-composer-stop"
              onClick={onStopAndSwitchToSelf}
              aria-label={t('statusView.feedback.stopTitle')}
              title={t('statusView.feedback.stopTitle')}
            >
              <PixelIcon name="stop" size={13} />
            </button>
          ) : stopRequested ? null : (
            <button
              type="button"
              className="primary-btn status-composer-send"
              onClick={onSend}
              disabled={sending || trimmed.length < 10 || pendingAttachmentReads > 0}
              aria-label={sending ? t('statusView.feedback.sending') : t('statusView.feedback.submit')}
              title={sending ? t('statusView.feedback.sending') : t('statusView.feedback.submit')}
            >
              {sending ? (
                <span className="status-composer-send-spinner" aria-hidden="true" />
              ) : (
                <PixelIcon name="arrowRight" size={13} />
              )}
            </button>
          )}
        </div>
      </div>
      {/* Sending's indicator now sits inline next to Send, above */}
      {error || notice ? (
        <div className="status-feedback-actions">
          {error ? <p className="error">{error}</p> : <p className="status-feedback-notice">{notice}</p>}
        </div>
      ) : null}
      <SketchModal isOpen={isSketchOpen} onClose={() => setIsSketchOpen(false)} onSaveSketch={handleSaveSketch} />
    </div>
  );
}

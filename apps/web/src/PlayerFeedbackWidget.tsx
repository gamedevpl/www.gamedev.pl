import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';
import { PixelIcon } from './PixelIcon';
import { submitPlayerFeedback, type PlayerFeedbackError } from './playerFeedbackApi';

/**
 * Written player feedback (docs/improvement-loop-plan.md, signal source #1) — the
 * minimal post-play prompt this item calls for: a compact control next to the vote
 * widget that reveals a short text form on demand, rather than a persistent panel
 * competing with the game for space.
 *
 * Requires a session, like casting a vote (see player-feedback.ts for the fuller
 * rationale — free text is a materially bigger abuse surface than a thumb). Signed
 * out, the control shows what it would need rather than pretending to accept text
 * it can't attribute to anyone.
 */
export function PlayerFeedbackWidget({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const trimmed = text.trim();

  const send = async () => {
    if (trimmed.length < 10 || state === 'sending') return;
    setState('sending');
    setError(null);
    try {
      await submitPlayerFeedback(slug, trimmed);
      setState('sent');
      setText('');
    } catch (err) {
      const feedbackError = err as PlayerFeedbackError;
      if (feedbackError.message === 'content_rejected') {
        setError(t('errors.contentRejected.other'));
      } else if (feedbackError.message.includes('quota')) {
        setError(t('player.feedback.quota'));
      } else {
        setError(t('player.feedback.error'));
      }
      setState('idle');
    }
  };

  const signedOutTitle = t('player.feedback.signInToLeave');

  return (
    <div className="feedback-widget">
      <button
        type="button"
        className="secondary-btn feedback-btn"
        onClick={() => setOpen((current) => !current)}
        disabled={!user}
        aria-expanded={open}
        aria-label={t('player.feedback.action')}
        title={user ? t('player.feedback.action') : signedOutTitle}
      >
        <PixelIcon name="pencil" size={13} />
        <span className="btn-label">{t('player.feedback.action')}</span>
      </button>
      {open && user && (
        <div className="feedback-popover" role="dialog" aria-label={t('player.feedback.action')}>
          {state === 'sent' ? (
            <p className="feedback-sent">
              <PixelIcon name="check" size={13} /> {t('player.feedback.sent')}
            </p>
          ) : (
            <>
              <textarea
                className="feedback-input"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={t('player.feedback.placeholder')}
                rows={3}
                maxLength={2000}
                autoFocus
              />
              <div className="feedback-actions">
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => void send()}
                  disabled={state === 'sending' || trimmed.length < 10}
                >
                  {state === 'sending' ? t('player.feedback.sending') : t('player.feedback.submit')}
                </button>
              </div>
              {error ? <p className="error">{error}</p> : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}

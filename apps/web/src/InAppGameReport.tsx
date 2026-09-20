import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MODERATION_FLAG_REASONS, type ModerationFlagReason } from '@gamedevpl/contract';
import { AuthModal } from './AuthModal.js';
import { useAuth } from './AuthContext.js';
import { PixelIcon } from './PixelIcon.js';
import { submitGameReport, type ReportGameError } from './reportGameApi.js';

const REASON_KEYS: Record<ModerationFlagReason, string> = {
  sexual: 'report.inApp.reasonSexual',
  hate: 'report.inApp.reasonHate',
  violence: 'report.inApp.reasonViolence',
  targets_person: 'report.inApp.reasonTargetsPerson',
  infringing: 'report.inApp.reasonInfringing',
  other: 'report.inApp.reasonOther',
};

export function InAppGameReport({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [reason, setReason] = useState<ModerationFlagReason>('other');
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const trimmed = note.trim();

  const send = async () => {
    if (trimmed.length < 1 || state === 'sending') return;
    setState('sending');
    setError(null);
    try {
      await submitGameReport(slug, reason, trimmed);
      setState('sent');
      setNote('');
    } catch (err) {
      const reportError = err as ReportGameError;
      if (reportError.status === 429) {
        setError(t('report.inApp.rateLimited'));
      } else if (reportError.message === 'content_rejected') {
        setError(t('errors.contentRejected.other'));
      } else {
        setError(t('report.inApp.error'));
      }
      setState('idle');
    }
  };

  const onToggle = () => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    setOpen((current) => !current);
  };

  return (
    <>
      <div className="report-widget">
        <button
          type="button"
          className="secondary-btn report-btn"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={t('report.inApp.action')}
          title={user ? t('report.inApp.action') : t('report.inApp.signInToReport')}
        >
          <PixelIcon name="flag" size={13} />
          <span className="btn-label">{t('report.inApp.action')}</span>
        </button>
        {open && user && (
          <div className="report-popover" role="dialog" aria-label={t('report.inApp.action')}>
            {state === 'sent' ? (
              <p className="feedback-sent">
                <PixelIcon name="check" size={13} /> {t('report.inApp.sent')}
              </p>
            ) : (
              <>
                <label className="report-reason-label" htmlFor={`report-reason-${slug}`}>
                  {t('report.inApp.reasonLabel')}
                </label>
                <select
                  id={`report-reason-${slug}`}
                  className="report-reason-select"
                  value={reason}
                  onChange={(event) => setReason(event.target.value as ModerationFlagReason)}
                >
                  {MODERATION_FLAG_REASONS.map((value) => (
                    <option key={value} value={value}>
                      {t(REASON_KEYS[value])}
                    </option>
                  ))}
                </select>
                <textarea
                  className="feedback-input"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={t('report.inApp.placeholder')}
                  rows={3}
                  maxLength={500}
                  autoFocus
                />
                <div className="feedback-actions">
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => void send()}
                    disabled={state === 'sending' || trimmed.length < 1}
                  >
                    {state === 'sending' ? t('report.inApp.sending') : t('report.inApp.submit')}
                  </button>
                </div>
                {error ? <p className="error">{error}</p> : null}
              </>
            )}
          </div>
        )}
      </div>
      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        title={t('report.inApp.signInTitle')}
        subtitle={t('report.inApp.signInSubtitle')}
      />
    </>
  );
}

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { submitContact, type ContactError } from './contactApi.js';
import { CONTACT_EMAIL } from './legal/operator.js';
import { PixelIcon } from './PixelIcon.js';
import { legalPath } from './core/router.js';

/**
 * Public contact form. Replaces the old footer link to the GitHub issues list for
 * general outreach — bug reports still go to the tracker (see SiteFooter project
 * links); this is "write to the operator", delivered by the Resend mailer to the
 * published DSA/GDPR address.
 *
 * Mounted before the closed-beta gate, like LegalPage: a contact point behind
 * sign-in is not a published contact point.
 */
export function ContactPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const trimmedMessage = message.trim();
  const canSend =
    state !== 'sending' && trimmedName.length >= 1 && trimmedEmail.includes('@') && trimmedMessage.length >= 10;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSend) return;
    setState('sending');
    setError(null);
    try {
      await submitContact({ name: trimmedName, email: trimmedEmail, message: trimmedMessage });
      setState('sent');
      setName('');
      setEmail('');
      setMessage('');
    } catch (err) {
      const contactError = err as ContactError;
      if (contactError.message === 'content_rejected') {
        setError(t('errors.contentRejected.other'));
      } else if (contactError.status === 429) {
        setError(t('contact.rateLimited'));
      } else {
        setError(t('contact.error'));
      }
      setState('idle');
    }
  };

  return (
    <article className="contact-page">
      <header className="contact-header">
        <button type="button" className="secondary-btn contact-back" onClick={onBack}>
          <PixelIcon name="close" size={12} /> {t('contact.back')}
        </button>
        <h1 className="contact-title">{t('contact.title')}</h1>
        <p className="contact-intro">{t('contact.intro')}</p>
      </header>

      {state === 'sent' ? (
        <p className="contact-sent" role="status">
          <PixelIcon name="check" size={14} /> {t('contact.sent')}
        </p>
      ) : (
        <form className="contact-form" onSubmit={(event) => void onSubmit(event)} noValidate>
          <label className="contact-field">
            <span className="contact-label">{t('contact.name')}</span>
            <input
              className="contact-input"
              type="text"
              name="name"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              required
            />
          </label>

          <label className="contact-field">
            <span className="contact-label">{t('contact.email')}</span>
            <input
              className="contact-input"
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={254}
              required
            />
          </label>

          <label className="contact-field">
            <span className="contact-label">{t('contact.message')}</span>
            <textarea
              className="contact-input contact-textarea"
              name="message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={6}
              maxLength={4000}
              required
            />
          </label>

          <p className="contact-privacy">
            {t('contact.privacyNote')} <a href={legalPath('privacy')}>{t('legal.privacy')}</a>
          </p>

          <div className="contact-actions">
            <button type="submit" className="primary-btn" disabled={!canSend}>
              {state === 'sending' ? t('contact.sending') : t('contact.submit')}
            </button>
          </div>

          {error ? <p className="error">{error}</p> : null}
        </form>
      )}

      <p className="contact-alt">
        {t('contact.orEmail')} <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </article>
  );
}

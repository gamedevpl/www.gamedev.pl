import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext.js';
import { PixelIcon } from './PixelIcon.js';
import { proposalsPath } from './core/router.js';
import { canProposeTo, proposeErrorKey } from './proposeEligibility.js';
import {
  proposeChange,
  PROPOSAL_DESCRIPTION_MAX,
  PROPOSAL_DESCRIPTION_MIN,
  PROPOSAL_TITLE_MAX,
  PROPOSAL_TITLE_MIN,
} from './proposalsApi.js';
import './propose-composer.css';

// A player's written suggestion to the creator; text only, never code.
export function ProposeChangeWidget({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [canPropose, setCanPropose] = useState(false);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCanPropose(false);
    if (!uid) return;
    let cancelled = false;
    void canProposeTo(uid, slug).then((answer) => {
      if (!cancelled) setCanPropose(answer);
    });
    return () => {
      cancelled = true;
    };
  }, [uid, slug]);

  if (!uid || !canPropose) return null;

  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();
  const valid = trimmedTitle.length >= PROPOSAL_TITLE_MIN && trimmedDescription.length >= PROPOSAL_DESCRIPTION_MIN;

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || state === 'sending') return;
    setState('sending');
    setError(null);
    try {
      await proposeChange(slug, { title: trimmedTitle, description: trimmedDescription });
      setState('sent');
      setTitle('');
      setDescription('');
    } catch (caught) {
      setError(t(proposeErrorKey(caught)));
      setState('idle');
    }
  };

  const toggle = () => {
    setOpen((current) => !current);
    if (state === 'sent') setState('idle');
  };

  return (
    <div className="feedback-widget propose-change-widget">
      <button
        type="button"
        className="secondary-btn feedback-btn propose-change-btn"
        onClick={toggle}
        aria-expanded={open}
        aria-label={t('propose.action')}
        title={t('propose.action')}
      >
        <PixelIcon name="wrench" size={13} />
        <span className="btn-label">{t('propose.action')}</span>
      </button>
      {open ? (
        <div className="feedback-popover propose-change-popover" role="dialog" aria-label={t('propose.title')}>
          {state === 'sent' ? (
            <div className="propose-sent" role="status">
              <p className="feedback-sent">
                <PixelIcon name="check" size={13} /> {t('propose.sent')}
              </p>
              <a className="propose-track" href={proposalsPath()}>
                {t('propose.track')}
              </a>
            </div>
          ) : (
            <form className="propose-form" onSubmit={(event) => void send(event)} noValidate>
              <label className="propose-field">
                <span className="propose-field-head">
                  {t('propose.fieldTitle')}
                  <Counter value={title} min={PROPOSAL_TITLE_MIN} max={PROPOSAL_TITLE_MAX} />
                </span>
                <input
                  type="text"
                  name="title"
                  value={title}
                  maxLength={PROPOSAL_TITLE_MAX}
                  placeholder={t('propose.fieldTitlePlaceholder')}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={state === 'sending'}
                  autoFocus
                />
              </label>
              <label className="propose-field">
                <span className="propose-field-head">
                  {t('propose.fieldDescription')}
                  <Counter value={description} min={PROPOSAL_DESCRIPTION_MIN} max={PROPOSAL_DESCRIPTION_MAX} />
                </span>
                <textarea
                  name="description"
                  value={description}
                  rows={5}
                  maxLength={PROPOSAL_DESCRIPTION_MAX}
                  placeholder={t('propose.fieldDescriptionPlaceholder')}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={state === 'sending'}
                />
              </label>
              <p className="propose-note">{t('propose.note')}</p>
              {error ? (
                <p className="propose-error" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="propose-actions">
                <button type="submit" className="propose-btn is-primary" disabled={!valid || state === 'sending'}>
                  {state === 'sending' ? t('propose.sending') : t('propose.submit')}
                </button>
                <button
                  type="button"
                  className="propose-btn is-quiet"
                  disabled={state === 'sending'}
                  onClick={() => setOpen(false)}
                >
                  {t('propose.cancel')}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}

// Live length, with the minimum named until it is met.
function Counter({ value, min, max }: { value: string; min: number; max: number }) {
  const { t } = useTranslation();
  const length = value.trim().length;
  return (
    <span className={`propose-counter${length < min ? ' is-short' : ''}`} aria-live="polite">
      {length < min ? `${t('propose.minLength', { min })} · ` : ''}
      {t('propose.counter', { count: value.length, max })}
    </span>
  );
}

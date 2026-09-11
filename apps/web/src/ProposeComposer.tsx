import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { proposeFromRemix, type ProposalApiError } from './proposalsApi.js';
import './propose-composer.css';

/**
 * The composer behind Remix's "Propose this change".
 *
 * Two jobs, and the second is the one that matters. It collects a title and a description
 * — but mostly it sets expectations, because a proposal is the first thing on this site a
 * player can send that another person will be asked to judge. Someone who does not know
 * their change gets checked, test-run, and then declined by a human will read a decline as
 * rejection by the platform. So the reassurance is not a footnote here; it is on screen
 * before they press send, in the same words the tracker will use afterwards.
 *
 * It deliberately does not preview the diff. A remix player changed the game by describing
 * what they wanted; showing them a TypeScript diff at the moment of sending would be
 * asking them to vouch for code they never wrote and cannot read.
 */
export function ProposeComposer(props: {
  remixId: string;
  /** Whose game this is, for the heading. Absent for platform-owned catalog games. */
  ownerHandle?: string | null;
  /** How many proposals this person already has open against this game, if known. */
  openCount?: number;
  maxOpen?: number;
  /** Current remix param values — baked into the candidate the way save bakes them. */
  params?: Record<string, string | number | boolean>;
  /** Painted collections, when the player edited them. */
  content?: Record<string, unknown>;
  onSent: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = title.trim().length >= 3 && description.trim().length >= 20 && !sending;

  async function send() {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      await proposeFromRemix(props.remixId, {
        title: title.trim(),
        description: description.trim(),
        ...(props.params ? { params: props.params } : {}),
        ...(props.content ? { content: props.content } : {}),
      });
      props.onSent();
    } catch (caught) {
      // Every refusal the API can give has its own sentence, because "something went
      // wrong" on the one action that costs a stranger's attention is the worst possible
      // answer — the player cannot tell whether to fix something or give up.
      const code = (caught as ProposalApiError).code;
      const key = code && code !== 'content_rejected' ? `propose.errors.${code}` : null;
      const translated = key ? t(key, { defaultValue: '' }) : '';
      setError(
        code === 'content_rejected'
          ? t(`errors.contentRejected.${(caught as ProposalApiError).category ?? 'other'}`, {
              defaultValue: t('errors.contentRejected.other'),
            })
          : translated || t('propose.errors.generic'),
      );
      setSending(false);
    }
  }

  return (
    <section className="propose-composer" aria-labelledby="propose-heading">
      <h3 id="propose-heading" className="propose-heading">
        {props.ownerHandle ? t('propose.title') : t('propose.titlePlatform')}
      </h3>

      <label className="propose-field">
        <span>{t('propose.fieldTitle')}</span>
        <input
          type="text"
          value={title}
          maxLength={120}
          placeholder={t('propose.fieldTitlePlaceholder')}
          onChange={(event) => setTitle(event.target.value)}
          disabled={sending}
        />
      </label>

      <label className="propose-field">
        <span>{t('propose.fieldDescription')}</span>
        <textarea
          value={description}
          maxLength={2000}
          rows={4}
          placeholder={t('propose.fieldDescriptionPlaceholder')}
          onChange={(event) => setDescription(event.target.value)}
          disabled={sending}
        />
      </label>

      {error ? (
        <p className="propose-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="propose-actions">
        <button type="button" className="remix-btn is-primary" disabled={!canSend} onClick={() => void send()}>
          {sending ? t('propose.sending') : t('propose.submit')}
        </button>
        <button type="button" className="remix-btn is-quiet" disabled={sending} onClick={props.onCancel}>
          {t('propose.cancel')}
        </button>
      </div>

      <p className="propose-note">
        {t('propose.reassure')}
        {props.openCount !== undefined && props.maxOpen !== undefined
          ? ' ' + t('propose.openCount', { count: props.openCount, max: props.maxOpen })
          : null}
      </p>
    </section>
  );
}

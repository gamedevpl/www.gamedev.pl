import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CreatorProposal, CreatorProposalOption } from '@gamedevpl/contract';
import { buildMediaUrl, type BuildMediaItem } from '../../submissionApi.js';
import { recordStudioStep, type BuilderDimension } from '../../visitTelemetry.js';
import './studio-proposal.css';

export type ProposalPick = { option: CreatorProposalOption; frame: BuildMediaItem; text: string };

export type ProposalHandlers = {
  builder: BuilderDimension;
  muted: boolean;
  onPick: (pick: ProposalPick) => void;
  onMute: () => void;
};

function frameItem(ref: string): BuildMediaItem {
  return { source: 'channel', ref };
}

function pickLanguage(language: string): 'en' | 'pl' {
  return language.toLowerCase().startsWith('pl') ? 'pl' : 'en';
}

// A studio turn's concept frames: two thumbnails, one tap to decide.
export function ProposalCard({
  token,
  proposal,
  handlers,
}: {
  token: string;
  proposal: CreatorProposal;
  handlers: ProposalHandlers;
}) {
  const { t, i18n } = useTranslation();
  const lang = pickLanguage(i18n.language);
  const [open, setOpen] = useState(false);
  const [decided, setDecided] = useState(false);

  useEffect(() => {
    // A muted creator sees the placeholder, so nothing was exposed.
    if (handlers.muted) return;
    recordStudioStep('proposal_shown', handlers.builder);
  }, [handlers.builder, handlers.muted]);

  if (handlers.muted) {
    return <p className="studio-proposal-muted">{t('statusView.proposal.muted')}</p>;
  }

  const pick = (option: CreatorProposalOption) => {
    recordStudioStep('proposal_picked', handlers.builder);
    setOpen(false);
    setDecided(true);
    handlers.onPick({ option, frame: frameItem(option.frameRef), text: option.prompt[lang] });
  };
  const postpone = () => {
    recordStudioStep('proposal_postponed', handlers.builder);
    setOpen(false);
  };
  const mute = () => {
    recordStudioStep('proposal_muted', handlers.builder);
    setOpen(false);
    handlers.onMute();
  };

  return (
    <div className="studio-proposal">
      <div className="studio-proposal-thumbs">
        {proposal.options.map((option) => (
          <button
            key={option.id}
            type="button"
            className="studio-proposal-thumb"
            onClick={() => setOpen(true)}
            title={t('statusView.proposal.open')}
          >
            <img src={buildMediaUrl(token, frameItem(option.frameRef))} alt={option.label[lang]} loading="lazy" />
            <span className="studio-proposal-ai">{t('statusView.proposal.aiLabel')}</span>
            <span className="studio-proposal-thumb-label">{option.label[lang]}</span>
          </button>
        ))}
      </div>
      {!decided ? (
        <button type="button" className="studio-proposal-open" onClick={() => setOpen(true)}>
          {t('statusView.proposal.open')}
        </button>
      ) : null}
      {open ? (
        <ProposalDialog
          token={token}
          proposal={proposal}
          lang={lang}
          onPick={pick}
          onPostpone={postpone}
          onMute={mute}
        />
      ) : null}
    </div>
  );
}

function ProposalDialog({
  token,
  proposal,
  lang,
  onPick,
  onPostpone,
  onMute,
}: {
  token: string;
  proposal: CreatorProposal;
  lang: 'en' | 'pl';
  onPick: (option: CreatorProposalOption) => void;
  onPostpone: () => void;
  onMute: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onPostpone();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onPostpone]);

  return (
    <div className="studio-proposal-overlay" role="presentation" onClick={onPostpone}>
      <div
        className="studio-proposal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('statusView.proposal.title')}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="studio-proposal-head">
          <h2>{t('statusView.proposal.title')}</h2>
          <button
            type="button"
            className="studio-proposal-close"
            onClick={onPostpone}
            aria-label={t('statusView.proposal.close')}
          >
            ×
          </button>
        </header>
        <p className="studio-proposal-intro">{t('statusView.proposal.intro')}</p>
        <div className="studio-proposal-grid">
          <figure className="studio-proposal-figure is-current">
            <img src={buildMediaUrl(token, frameItem(proposal.sourceRef))} alt={t('statusView.proposal.current')} />
            <figcaption>{t('statusView.proposal.current')}</figcaption>
          </figure>
          {proposal.options.map((option) => (
            <figure key={option.id} className="studio-proposal-figure">
              <img src={buildMediaUrl(token, frameItem(option.frameRef))} alt={option.label[lang]} />
              <span className="studio-proposal-ai">{t('statusView.proposal.aiLabel')}</span>
              <figcaption>
                <strong>{option.label[lang]}</strong>
                <span>{option.prompt[lang]}</span>
                <button type="button" className="studio-proposal-pick" onClick={() => onPick(option)}>
                  {t('statusView.proposal.pick')}
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
        <footer className="studio-proposal-foot">
          <button type="button" className="studio-proposal-secondary" onClick={onPostpone}>
            {t('statusView.proposal.notNow')}
          </button>
          <button type="button" className="studio-proposal-quiet" onClick={onMute}>
            {t('statusView.proposal.askLess')}
          </button>
        </footer>
      </div>
    </div>
  );
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { CreatorProposal, CreatorProposalOption } from '@gamedevpl/contract';
import { buildMediaUrl, type BuildMediaItem } from '../../submissionApi.js';
import { recordStudioStep, type BuilderDimension } from '../../visitTelemetry.js';
import './studio-proposal.css';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  const cardRef = useRef<HTMLDivElement | null>(null);
  // The builder that drew the card, not the current one.
  const builderRef = useRef(proposal.builder ?? handlers.builder);
  const exposed = useRef(false);
  const mutedNoteRef = useRef<HTMLParagraphElement | null>(null);
  const claimFocus = useRef(false);

  useLayoutEffect(() => {
    if (!claimFocus.current) return;
    claimFocus.current = false;
    // Deciding removes the opener, so the dialog had nowhere to restore.
    if (document.activeElement !== document.body) return;
    const landing = mutedNoteRef.current ?? cardRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    landing?.focus();
  });

  useEffect(() => {
    // Mounting is not seeing; an off-screen card is no exposure.
    if (handlers.muted || exposed.current) return;
    const node = cardRef.current;
    if (!node || typeof IntersectionObserver !== 'function') {
      exposed.current = true;
      recordStudioStep('proposal_shown', builderRef.current);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting) || exposed.current) return;
      exposed.current = true;
      recordStudioStep('proposal_shown', builderRef.current);
      observer.disconnect();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [handlers.muted]);

  if (handlers.muted) {
    return (
      <p className="studio-proposal-muted" ref={mutedNoteRef} tabIndex={-1}>
        {t('statusView.proposal.muted')}
      </p>
    );
  }

  const pick = (option: CreatorProposalOption) => {
    recordStudioStep('proposal_picked', builderRef.current);
    claimFocus.current = true;
    setOpen(false);
    setDecided(true);
    handlers.onPick({ option, frame: frameItem(option.frameRef), text: option.prompt[lang] });
  };
  const postpone = () => {
    recordStudioStep('proposal_postponed', builderRef.current);
    setOpen(false);
  };
  const mute = () => {
    recordStudioStep('proposal_muted', builderRef.current);
    claimFocus.current = true;
    setOpen(false);
    handlers.onMute();
  };

  return (
    <div className="studio-proposal" ref={cardRef}>
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
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null | undefined>(undefined);
  // Read at first render, before the commit moves focus.
  if (openerRef.current === undefined) {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  const onPostponeRef = useRef(onPostpone);
  onPostponeRef.current = onPostpone;

  useLayoutEffect(() => {
    dialogRef.current?.focus();
    return () => openerRef.current?.focus?.();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onPostponeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
        root.focus();
        return;
      }
      const active = document.activeElement;
      // The box is a landing spot, not a stop on the ring.
      const atEdge = active === root || !root.contains(active);
      if (event.shiftKey && (atEdge || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (atEdge || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    // Capture, so Escape cannot also switch the studio tab behind.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  // The rail's blurred backdrop would trap and clip a fixed overlay.
  return createPortal(
    <div className="studio-proposal-overlay" role="presentation" onClick={onPostpone}>
      <div
        ref={dialogRef}
        className="studio-proposal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('statusView.proposal.title')}
        tabIndex={-1}
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
    </div>,
    document.body,
  );
}

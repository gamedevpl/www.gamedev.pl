import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { abandonSubmission, deleteGame, unpublishGame } from '../../submissionApi.js';
import type { StudioShelfGame } from '../../studioShelf.js';

const actions = {
  remove: {
    trigger: 'abandonRemove',
    title: 'removeTitle',
    hint: 'abandonHintRemove',
    confirm: 'confirmRemove',
  },
  abandon: {
    trigger: 'abandon',
    title: 'abandonTitle',
    hint: 'abandonHintKeepLive',
    confirm: 'confirmAbandon',
    run: abandonSubmission,
  },
  unpublish: {
    trigger: 'unpublish',
    title: 'unpublishTitle',
    hint: 'unpublishHint',
    confirm: 'unpublish',
    run: unpublishGame,
  },
} as const;

type Action = keyof typeof actions;
type GameProps = {
  game: StudioShelfGame;
  onUnpublished: () => void;
  onRemoved: (token: string) => void | Promise<void>;
};

export function StudioRemovalActions({
  game,
  publishedJob,
  catalogLive,
  onUnpublished,
  onRemoved,
}: GameProps & {
  publishedJob: boolean;
  catalogLive: boolean;
}) {
  const { t } = useTranslation();
  const [action, setAction] = useState<Action | null>(null);

  function trigger(kind: Action) {
    return (
      <button
        type="button"
        className={kind === 'unpublish' ? 'status-delete' : 'status-abandon'}
        aria-haspopup="dialog"
        onClick={() => setAction(kind)}
      >
        {t(`studioPanel.overview.${actions[kind].trigger}`)}
      </button>
    );
  }

  return (
    <section className="studio-rail-section">
      <details className="studio-removal-menu">
        <summary>{t('studioPanel.overview.manage')}</summary>
        <div className="studio-actions">
          {catalogLive && !publishedJob && trigger('abandon')}
          {catalogLive ? (
            trigger('unpublish')
          ) : game.draftShared ? (
            <p>{t('studioPanel.overview.unshareFirst')}</p>
          ) : game.slug ? (
            trigger('remove')
          ) : (
            <p>{t('studioPanel.overview.slugMissing')}</p>
          )}
        </div>
      </details>
      {action && (
        <RemovalDialog
          action={action}
          game={game}
          onUnpublished={onUnpublished}
          onRemoved={onRemoved}
          onCancel={() => setAction(null)}
        />
      )}
    </section>
  );
}

function RemovalDialog({
  action,
  game,
  onRemoved,
  onUnpublished,
  onCancel,
}: GameProps & { action: Action; onCancel: () => void }) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const ready = action !== 'remove' || (!!game.slug && confirmation === game.slug);
  const [errorMessage, setErrorMessage] = useState('');
  const { title, hint, confirm } = actions[action];

  useLayoutEffect(() => {
    const element = dialog.current!;
    element.showModal();
    cancel.current?.focus();
    return () => element.close();
  }, []);

  async function submit() {
    if (busy || !ready) return;
    setBusy(true);
    setErrorMessage('');
    try {
      if (action === 'remove') await deleteGame(game.token, confirmation);
      else await actions[action].run(game.token);
      if (action === 'unpublish') onUnpublished();
      else await onRemoved(game.token);
      onCancel();
    } catch (error) {
      setErrorMessage(
        error instanceof Error && error.message === 'unpublish_repo_first' ? 'repoStillPublic' : 'removalFailed',
      );
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="qa-confirm-dialog studio-removal-dialog"
      aria-labelledby="studio-removal-title"
      aria-describedby="studio-removal-hint"
      onKeyDown={(event) => {
        if (event.key === 'Escape') event.stopPropagation();
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h3 id="studio-removal-title" className="qa-confirm-title">
        {t(`studioPanel.overview.${title}`, { title: game.title })}
      </h3>
      <p id="studio-removal-hint" className="qa-confirm-desc">
        {t(`studioPanel.overview.${hint}`)}
      </p>
      {action === 'remove' && (
        <label className="studio-slug-confirm">
          {t('studioPanel.overview.typeSlug', { slug: game.slug })}
          <input
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
      )}
      {errorMessage && <p role="alert">{t(`studioPanel.overview.${errorMessage}`)}</p>}
      <div className="qa-confirm-actions">
        <button
          ref={cancel}
          type="button"
          className="qa-confirm-btn qa-confirm-keep"
          disabled={busy}
          onClick={onCancel}
        >
          {t('studioPanel.overview.cancel')}
        </button>
        <button
          type="button"
          className="qa-confirm-btn qa-confirm-discard"
          disabled={busy || !ready}
          onClick={() => void submit()}
        >
          {t(`studioPanel.overview.${confirm}`)}
        </button>
      </div>
    </dialog>
  );
}

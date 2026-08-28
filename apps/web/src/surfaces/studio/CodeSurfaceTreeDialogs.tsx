import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from '../../PixelIcon.js';
import type { PlannedUpload } from './codeSurfaceUpload.js';

export type TreeConfirm =
  | { kind: 'delete-file'; path: string }
  | { kind: 'delete-folder'; path: string; files: string[] }
  | { kind: 'delete-empty-folder'; path: string }
  | { kind: 'move-file'; from: string; to: string; overwrite: boolean }
  | { kind: 'move-folder'; from: string; to: string; overwrite: string[]; count: number }
  | { kind: 'upload'; plan: PlannedUpload }
  | { kind: 'discard' };

export type TreePrompt =
  | { kind: 'new-file'; folder: string; value: string; exists: boolean }
  | { kind: 'new-folder'; folder: string; value: string }
  | { kind: 'move-file'; from: string; value: string }
  | { kind: 'move-folder'; from: string; value: string };

function listed(paths: string[], cap = 8): { shown: string[]; extra: number } {
  return { shown: paths.slice(0, cap), extra: Math.max(0, paths.length - cap) };
}

function portal(node: ReactNode) {
  return createPortal(node, document.body);
}

export function CodeSurfaceTreeDialogs(props: {
  confirm: TreeConfirm | null;
  prompt: TreePrompt | null;
  promptValue: string;
  busy: boolean;
  onPromptValue: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  onSubmitPrompt: () => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (props.prompt) inputRef.current?.focus();
  }, [props.prompt]);

  if (props.prompt) {
    const title =
      props.prompt.kind === 'new-file'
        ? t('studioPanel.code.tree.promptNewFile')
        : props.prompt.kind === 'new-folder'
          ? t('studioPanel.code.tree.promptNewFolder')
          : props.prompt.kind === 'move-file'
            ? t('studioPanel.code.tree.promptMoveFile')
            : t('studioPanel.code.tree.promptMoveFolder');
    const exists = props.prompt.kind === 'new-file' && props.prompt.exists;
    return portal(
      <div className="code-surface-tree-backdrop" role="presentation" onClick={props.onCancel}>
        <section
          className="code-surface-tree-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="code-tree-prompt-title"
          data-testid="code-tree-prompt"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="code-surface-tree-dialog-head">
            <h3 id="code-tree-prompt-title">{title}</h3>
            <button
              type="button"
              className="modal-close-btn"
              onClick={props.onCancel}
              aria-label={t('studioPanel.code.tree.cancel')}
            >
              <PixelIcon name="close" size={13} />
            </button>
          </header>
          <label className="code-surface-tree-dialog-label">
            {props.prompt.kind === 'new-folder'
              ? t('studioPanel.code.tree.nameLabel')
              : t('studioPanel.code.tree.pathLabel')}
            <input
              ref={inputRef}
              value={props.promptValue}
              onChange={(event) => props.onPromptValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') props.onSubmitPrompt();
                if (event.key === 'Escape') props.onCancel();
              }}
              spellCheck={false}
              disabled={props.busy}
            />
          </label>
          {exists ? <p className="code-surface-tree-dialog-warn">{t('studioPanel.code.tree.exists')}</p> : null}
          <div className="code-surface-tree-dialog-actions">
            <button type="button" onClick={props.onCancel} disabled={props.busy}>
              {t('studioPanel.code.tree.cancel')}
            </button>
            <button
              type="button"
              className="code-surface-tree-dialog-confirm"
              data-testid="code-tree-prompt-submit"
              onClick={props.onSubmitPrompt}
              disabled={props.busy || exists}
            >
              {props.prompt.kind.startsWith('move')
                ? t('studioPanel.code.tree.move')
                : t('studioPanel.code.tree.create')}
            </button>
          </div>
        </section>
      </div>,
    );
  }

  if (!props.confirm) return null;

  return portal(
    <div className="code-surface-tree-backdrop" role="presentation" onClick={props.busy ? undefined : props.onCancel}>
      <section
        className="code-surface-tree-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="code-tree-confirm-title"
        data-testid="code-tree-confirm-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="code-surface-tree-dialog-head">
          <h3 id="code-tree-confirm-title">{confirmTitle(props.confirm, t)}</h3>
          <button
            type="button"
            className="modal-close-btn"
            onClick={props.onCancel}
            disabled={props.busy}
            aria-label={t('studioPanel.code.tree.cancel')}
          >
            <PixelIcon name="close" size={13} />
          </button>
        </header>
        <ConfirmBody confirm={props.confirm} />
        <div className="code-surface-tree-dialog-actions">
          <button type="button" onClick={props.onCancel} disabled={props.busy}>
            {t('studioPanel.code.tree.cancel')}
          </button>
          <button
            type="button"
            className="code-surface-tree-dialog-confirm is-danger"
            data-testid="code-tree-confirm"
            onClick={props.onConfirm}
            disabled={props.busy}
          >
            {props.busy ? t('studioPanel.code.tree.working') : confirmAction(props.confirm, t)}
          </button>
        </div>
      </section>
    </div>,
  );
}

function confirmTitle(confirm: TreeConfirm, t: (key: string, opts?: Record<string, unknown>) => string): string {
  switch (confirm.kind) {
    case 'delete-file':
    case 'delete-folder':
    case 'delete-empty-folder':
      return t('studioPanel.code.tree.confirmDeleteTitle');
    case 'move-file':
    case 'move-folder':
      return t('studioPanel.code.tree.confirmMoveTitle');
    case 'upload':
      return t('studioPanel.code.tree.confirmUploadTitle');
    case 'discard':
      return t('studioPanel.code.tree.confirmDiscardTitle');
  }
}

function confirmAction(confirm: TreeConfirm, t: (key: string) => string): string {
  if (confirm.kind === 'discard') return t('studioPanel.code.discard');
  if (confirm.kind.startsWith('delete')) return t('studioPanel.code.tree.delete');
  if (confirm.kind.startsWith('move')) return t('studioPanel.code.tree.move');
  return t('studioPanel.code.tree.addFiles');
}

function ConfirmBody({ confirm }: { confirm: TreeConfirm }) {
  const { t } = useTranslation();
  if (confirm.kind === 'delete-file') {
    return <p>{t('studioPanel.code.tree.confirmDeleteFile', { path: confirm.path })}</p>;
  }
  if (confirm.kind === 'delete-empty-folder') {
    return <p>{t('studioPanel.code.tree.confirmDeleteEmptyFolder', { path: confirm.path })}</p>;
  }
  if (confirm.kind === 'delete-folder') {
    const { shown, extra } = listed(confirm.files);
    return (
      <>
        <p>{t('studioPanel.code.tree.confirmDeleteFolder', { path: confirm.path, count: confirm.files.length })}</p>
        <ul className="code-surface-tree-dialog-list">
          {shown.map((path) => (
            <li key={path}>{path}</li>
          ))}
        </ul>
        {extra > 0 ? <p>{t('studioPanel.code.tree.moreFiles', { count: extra })}</p> : null}
      </>
    );
  }
  if (confirm.kind === 'move-file') {
    return (
      <>
        <p>{t('studioPanel.code.tree.confirmMoveFile', { from: confirm.from, to: confirm.to })}</p>
        {confirm.overwrite ? (
          <p className="code-surface-tree-dialog-warn">
            {t('studioPanel.code.tree.confirmOverwrite', { path: confirm.to })}
          </p>
        ) : null}
      </>
    );
  }
  if (confirm.kind === 'move-folder') {
    return (
      <>
        <p>
          {t('studioPanel.code.tree.confirmMoveFolder', { from: confirm.from, to: confirm.to, count: confirm.count })}
        </p>
        {confirm.overwrite.length > 0 ? (
          <p className="code-surface-tree-dialog-warn">
            {t('studioPanel.code.tree.confirmOverwriteMany', { count: confirm.overwrite.length })}
          </p>
        ) : null}
      </>
    );
  }
  if (confirm.kind === 'discard') {
    return <p>{t('studioPanel.code.tree.confirmDiscardBody')}</p>;
  }
  const { plan } = confirm;
  const over = listed(plan.overwrite.map((file) => file.path));
  const skipped = listed(plan.skipped.map((file) => `${file.path} — ${file.reason}`));
  return (
    <>
      <p>{t('studioPanel.code.tree.confirmUpload', { count: plan.add.length + plan.overwrite.length })}</p>
      {plan.overwrite.length > 0 ? (
        <>
          <p className="code-surface-tree-dialog-warn">
            {t('studioPanel.code.tree.confirmUploadOverwrite', { count: plan.overwrite.length })}
          </p>
          <ul className="code-surface-tree-dialog-list">
            {over.shown.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        </>
      ) : null}
      {plan.skipped.length > 0 ? (
        <>
          <p>{t('studioPanel.code.tree.confirmUploadSkip', { count: plan.skipped.length })}</p>
          <ul className="code-surface-tree-dialog-list">
            {skipped.shown.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}

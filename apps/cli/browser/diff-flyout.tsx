import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SessionDiff, SessionDiffInfo } from '../src/session-diff.js';
import { RichText } from './transcript-view.js';

export function DiffFlyout({
  diff,
  read,
  close,
}: {
  diff: SessionDiffInfo | null;
  read?: (id: number) => Promise<SessionDiff>;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [contents, setContents] = useState<SessionDiff | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setContents(null);
    setError('');
    if (diff && read)
      void read(diff.id).then(
        (value) => {
          if (!cancelled) setContents(value);
        },
        () => {
          if (!cancelled) setError('Diff is no longer available. Run /diff again.');
        },
      );
    return () => {
      cancelled = true;
    };
  }, [diff, read]);
  useEffect(() => {
    const node = dialog.current;
    if (diff && node && !node.open) node.showModal();
  }, [diff]);
  if (!diff) return null;
  return createPortal(
    <dialog ref={dialog} className="diff-flyout" aria-labelledby="diff-title" onClose={close}>
      <header className="diff-head">
        <div>
          <h2 id="diff-title">Working copy diff</h2>
          <p>
            Platform → local · {diff.files.length} {diff.files.length === 1 ? 'file' : 'files'}
          </p>
        </div>
        <button type="button" onClick={() => dialog.current?.close()} aria-label="Close diff" autoFocus>
          Close · Esc
        </button>
      </header>
      <pre className="diff-content" tabIndex={0} aria-label="Diff contents">
        {contents?.id === diff.id
          ? contents.lines.map((line, index) => (
              <span key={index}>
                <RichText text={line} />
                {'\n'}
              </span>
            ))
          : error || 'Loading diff…'}
      </pre>
    </dialog>,
    document.body,
  );
}

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from '../../PixelIcon.js';
import { tokenizeLine } from './codeTokens.js';

// GA-09: the kit .d.ts, opened at the jump's line.
export function CodeSurfaceKitViewer({
  declaration,
  activeLine,
  onClose,
}: {
  declaration: string;
  activeLine: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const bodyRef = useRef<HTMLPreElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // GA-09: centers the jump target the moment the viewer opens.
  useEffect(() => {
    bodyRef.current?.querySelector('.is-jump-target')?.scrollIntoView?.({ block: 'center' });
  }, [activeLine]);

  // GA-09: Escape closes it, like the file picker.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseRef.current();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="code-surface-kit-backdrop" role="presentation" onClick={() => onClose()}>
      <section
        className="code-surface-kit-viewer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="code-surface-kit-viewer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="code-surface-kit-viewer-head">
          <h3 id="code-surface-kit-viewer-title">{t('studioPanel.code.kitViewerTitle')}</h3>
          <button
            type="button"
            className="code-surface-kit-close"
            onClick={() => onClose()}
            aria-label={t('studioPanel.code.kitViewerClose')}
          >
            <PixelIcon name="close" size={13} />
          </button>
        </header>
        <pre className="code-surface-readonly-view code-surface-kit-viewer-body" ref={bodyRef}>
          {declaration.split('\n').map((line, index) => (
            <div key={index} className={`code-surface-line${index + 1 === activeLine ? ' is-jump-target' : ''}`}>
              <span className="code-surface-line-number">{index + 1}</span>
              <span className="code-surface-line-text">
                {tokenizeLine(line, 'typescript').map((token, tokenIndex) => (
                  <span key={tokenIndex} className={`code-tok code-tok-${token.kind}`}>
                    {token.text}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </pre>
      </section>
    </div>
  );
}

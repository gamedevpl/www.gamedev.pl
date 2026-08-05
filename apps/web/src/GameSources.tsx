import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tokenizeLine, type CodeLanguage } from './codeTokens.js';
import {
  fetchGameSourceFile,
  fetchGameSources,
  type GameSourceFile,
  type GameSources as GameSourcesData,
} from './gameSourcesApi.js';
import { PixelIcon } from './PixelIcon.js';

/**
 * "Źródła" — the code, readable by anyone.
 *
 * A game built from a prompt is more interesting when you can read what it actually
 * is, so this is a first-class view rather than an escape hatch: the file list, the
 * bytes, and a numbered, highlighted reader.
 *
 * Highlighting is built from tokens as React elements (codeTokens.ts) — never from
 * HTML strings — so source that contains markup renders as source. The same reason
 * SpecMarkdown is hand-rolled: this file displays text an agent wrote, and the only
 * safe way to display it is as text.
 */

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

/** Read first — it is the file a curious visitor is actually looking for. */
const PREFERRED_FIRST = ['game.ts', 'SPEC.md', 'index.html'];

export function GameSources({ slug }: { slug: string }) {
  const { t, i18n } = useTranslation();
  const [listing, setListing] = useState<GameSourcesData | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [fileState, setFileState] = useState<'idle' | 'loading' | 'too_large' | 'error'>('idle');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    void fetchGameSources(slug)
      .then((loaded) => {
        if (cancelled) return;
        setListing(loaded);
        setState('ready');
        const first =
          PREFERRED_FIRST.find((path) => loaded.files.some((file) => file.path === path)) ??
          loaded.files[0]?.path ??
          null;
        setSelected(first);
      })
      .catch((err: { code?: string }) => {
        if (cancelled) return;
        setState(err.code === 'not_found' ? 'missing' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setFileState('loading');
    setContent(null);
    setCopied(false);
    void fetchGameSourceFile(slug, selected)
      .then((file) => {
        if (cancelled) return;
        setContent(file.content);
        setFileState('idle');
      })
      .catch((err: { code?: string }) => {
        if (cancelled) return;
        setFileState(err.code === 'too_large' ? 'too_large' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [slug, selected]);

  const current = useMemo(() => listing?.files.find((file) => file.path === selected) ?? null, [listing, selected]);

  const copy = useCallback(() => {
    if (!content) return;
    void navigator.clipboard
      ?.writeText(content)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  }, [content]);

  if (state === 'loading') return <p className="game-page-status">{t('gamePage.sources.loading')}</p>;
  if (state === 'missing') {
    return (
      <section className="game-page-placeholder">
        <h2>{t('gamePage.tabs.sources')}</h2>
        <p>{t('gamePage.sources.unavailable')}</p>
      </section>
    );
  }
  if (state === 'error' || !listing) {
    return <p className="game-page-status game-page-error">{t('gamePage.sources.error')}</p>;
  }

  return (
    <section className="game-sources" aria-label={t('gamePage.tabs.sources')}>
      <p className="game-sources-intro">
        {t('gamePage.sources.intro', {
          files: listing.files.length,
          size: formatBytes(listing.totalBytes, i18n.language),
        })}
        <span className="game-sources-version">{listing.version}</span>
      </p>

      <div className="game-sources-layout">
        <nav className="game-sources-list" aria-label={t('gamePage.sources.filesAria')}>
          <ul>
            {listing.files.map((file) => (
              <li key={file.path}>
                <button
                  type="button"
                  className={`game-sources-file${file.path === selected ? ' is-active' : ''}`}
                  aria-current={file.path === selected ? 'true' : undefined}
                  onClick={() => setSelected(file.path)}
                >
                  <span className="game-sources-file-path">{file.path}</span>
                  <span className="game-sources-file-bytes">{formatBytes(file.bytes, i18n.language)}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="game-sources-viewer">
          {current ? (
            <div className="game-sources-viewer-head">
              <code className="game-sources-viewer-path">{current.path}</code>
              <button type="button" className="secondary-btn game-sources-copy" onClick={copy} disabled={!content}>
                <PixelIcon name="check" size={12} />{' '}
                {copied ? t('gamePage.sources.copied') : t('gamePage.sources.copy')}
              </button>
            </div>
          ) : null}

          {fileState === 'loading' ? <p className="game-sources-note">{t('gamePage.sources.fileLoading')}</p> : null}
          {fileState === 'too_large' ? <p className="game-sources-note">{t('gamePage.sources.tooLarge')}</p> : null}
          {fileState === 'error' ? (
            <p className="game-sources-note game-page-error">{t('gamePage.sources.fileError')}</p>
          ) : null}
          {fileState === 'idle' && content !== null && current ? (
            <CodeView content={content} language={current.language} />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function CodeView({ content, language }: { content: string; language: GameSourceFile['language'] }) {
  const lines = useMemo(() => content.replace(/\r\n/g, '\n').split('\n'), [content]);
  return (
    <pre className="game-sources-code">
      <code>
        {lines.map((line, index) => (
          <span className="game-sources-line" key={index}>
            <span className="game-sources-gutter" aria-hidden="true">
              {index + 1}
            </span>
            <span className="game-sources-line-text">
              {tokenizeLine(line, language as CodeLanguage).map((token, tokenIndex) =>
                token.kind === 'plain' ? (
                  token.text
                ) : (
                  <span key={tokenIndex} className={`tok-${token.kind}`}>
                    {token.text}
                  </span>
                ),
              )}
              {'\n'}
            </span>
          </span>
        ))}
      </code>
    </pre>
  );
}

function formatBytes(bytes: number, language: string): string {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  const rounded = kib < 10 ? Math.round(kib * 10) / 10 : Math.round(kib);
  try {
    return `${rounded.toLocaleString(language)} KiB`;
  } catch {
    return `${rounded} KiB`;
  }
}

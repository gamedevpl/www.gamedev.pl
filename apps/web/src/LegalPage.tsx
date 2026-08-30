import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { legalDocument, type LegalBlock, type LegalDocId, type LegalDocument } from './legal/index.js';
import { renderInline } from './legal/inline.js';
import { OPERATOR_LEGAL_NAME } from './legal/operator.js';
import { legalAnchor, legalPath } from './core/router.js';
import { PixelIcon } from './PixelIcon.js';

function Block({ block }: { block: LegalBlock }) {
  if (block.kind === 'p') return <p>{renderInline(block.text)}</p>;
  if (block.kind === 'ul') {
    return (
      <ul>
        {block.items.map((item, index) => (
          <li key={index}>{renderInline(item)}</li>
        ))}
      </ul>
    );
  }
  return (
    // Wide tables scroll inside their own box rather than making the page scroll
    // sideways — the processing register has four columns and has to survive a phone.
    <div className="legal-table-scroll">
      <table className="legal-table">
        <thead>
          <tr>
            {block.head.map((cell) => (
              <th key={cell} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{renderInline(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Renders the privacy policy or the terms, in the reader's language.
 *
 * Mounted *before* the closed-beta gate in App: someone who has not signed in still
 * has to be able to read what we would do with their data. GDPR art. 13 wants that
 * information at the moment of collection, and the moment of collection is the Google
 * sign-in button on the splash screen.
 */
export function LegalPage({ doc, onBack }: { doc: LegalDocId; onBack: () => void }) {
  const { t, i18n } = useTranslation();
  // Only the reader's language is fetched — the other one never enters this bundle.
  const [legalDoc, setLegalDoc] = useState<LegalDocument | null>(null);
  useEffect(() => {
    let active = true;
    setLegalDoc(null);
    legalDocument(doc, i18n.language).then((loaded) => {
      if (active) setLegalDoc(loaded);
    });
    return () => {
      active = false;
    };
  }, [doc, i18n.language]);

  // Section anchors ride in the URL fragment (`/privacy#zglaszanie`) so a specific
  // clause can be cited in an email or a takedown notice and actually land on it.
  const anchor = legalAnchor(window.location.hash);
  useEffect(() => {
    if (!legalDoc) return;
    if (!anchor) {
      window.scrollTo({ top: 0 });
      return;
    }
    // Instant, not smooth: these documents are long enough that a cited clause can be
    // 7,000px down, and animating that is a slow ride to somewhere the reader already
    // asked to be. Smooth scrolling also silently does nothing in some environments.
    document.getElementById(anchor)?.scrollIntoView({ block: 'start' });
  }, [anchor, doc, legalDoc]);

  if (!legalDoc) {
    return (
      <article className="legal-page">
        <p className="content-loading">{t('app.loadingSurface')}</p>
      </article>
    );
  }

  const effective = new Date(legalDoc.effectiveDate).toLocaleDateString(i18n.language, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <article className="legal-page">
      <header className="legal-header">
        <button type="button" className="secondary-btn legal-back" onClick={onBack}>
          <PixelIcon name="close" size={12} /> {t('legal.back')}
        </button>
        <h1 className="legal-title">{legalDoc.title}</h1>
        <p className="legal-effective">{t('legal.effective', { date: effective })}</p>
        <p className="legal-intro">{legalDoc.intro}</p>
      </header>

      <nav className="legal-toc" aria-label={t('legal.contents')}>
        <h2 className="legal-toc-title">{t('legal.contents')}</h2>
        {/* Unnumbered: every heading already begins with its own number, and an <ol>
            around them rendered "1. 1. Provider and contact". */}
        <ul>
          {legalDoc.sections.map((section) => (
            <li key={section.id}>
              <a href={legalPath(doc, section.id)}>{section.heading}</a>
            </li>
          ))}
        </ul>
      </nav>

      {legalDoc.sections.map((section) => (
        <section key={section.id} id={section.id} className="legal-section">
          <h2>{section.heading}</h2>
          {section.blocks.map((block, index) => (
            <Block key={index} block={block} />
          ))}
        </section>
      ))}

      <footer className="legal-footer">
        {OPERATOR_LEGAL_NAME ? <p className="legal-operator">{OPERATOR_LEGAL_NAME}</p> : null}
        {/* Address and tax id render once published — see legal/operator.ts. */}
        <p>
          <a href={legalPath(doc === 'privacy' ? 'terms' : 'privacy')}>
            {doc === 'privacy' ? t('legal.terms') : t('legal.privacy')}
          </a>
        </p>
      </footer>
    </article>
  );
}

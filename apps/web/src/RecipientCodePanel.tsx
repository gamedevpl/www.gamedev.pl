import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchRecipientCode, rotateRecipientCode } from './transferApi.js';
import './RecipientCodePanel.css';

// Beside the other credentials, not permanently on the shelf.

export function RecipientCodePanel(): JSX.Element {
  const { t } = useTranslation();
  const [code, setCode] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A slow read must not reinstate a replaced code.
  const issued = useRef(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const ticket = (issued.current += 1);
    setLoading(true);
    try {
      const fetched = await fetchRecipientCode();
      if (issued.current !== ticket) return;
      setCode(fetched);
      setError(null);
    } catch {
      if (issued.current !== ticket) return;
      setError(t('studioShelf.transfer.errors.code'));
    } finally {
      if (issued.current === ticket) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function rotate(): Promise<void> {
    const ticket = (issued.current += 1);
    setRotating(true);
    setError(null);
    try {
      const rotated = await rotateRecipientCode();
      if (issued.current !== ticket) return;
      setCode(rotated);
      setRevealed(true);
    } catch {
      if (issued.current === ticket) setError(t('studioShelf.transfer.errors.rotate'));
    } finally {
      if (issued.current === ticket) {
        setRotating(false);
        setLoading(false);
      }
    }
  }

  return (
    <section className="recipient-code" aria-label={t('studioShelf.transfer.yourCode')} data-testid="recipient-code">
      <p className="studio-rail-credentials-hint">{t('studioShelf.transfer.codeHint')}</p>
      <div className="recipient-code-row">
        <span className="recipient-code-label">{t('studioShelf.transfer.yourCode')}</span>
        <code data-testid="studio-recipient-code">{revealed && code ? code : '••••••••'}</code>
        <button
          type="button"
          className="link-btn"
          onClick={() => setRevealed((shown) => !shown)}
          disabled={!code}
          data-testid="studio-recipient-code-reveal"
        >
          {revealed ? t('studioShelf.transfer.hide') : t('studioShelf.transfer.reveal')}
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={() => void rotate()}
          disabled={rotating || loading}
          data-testid="studio-recipient-code-rotate"
        >
          {rotating ? t('studioShelf.transfer.rotating') : t('studioShelf.transfer.rotate')}
        </button>
      </div>
      {error ? (
        <p className="error" role="alert" data-testid="recipient-code-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}

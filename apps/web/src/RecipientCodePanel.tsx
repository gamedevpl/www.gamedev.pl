import { useCallback, useEffect, useState } from 'react';
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

  const load = useCallback(async () => {
    try {
      setCode(await fetchRecipientCode());
      setError(null);
    } catch {
      setError(t('studioShelf.transfer.errors.code'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function rotate(): Promise<void> {
    setRotating(true);
    setError(null);
    try {
      setCode(await rotateRecipientCode());
      setRevealed(true);
    } catch {
      setError(t('studioShelf.transfer.errors.rotate'));
    } finally {
      setRotating(false);
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
          disabled={rotating}
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

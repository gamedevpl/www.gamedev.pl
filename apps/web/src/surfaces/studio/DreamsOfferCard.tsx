import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { answerDreamsOffer, fetchGameDreams, onGameDreamsChanged, type GameDreams } from '../../gameDreamsApi.js';

// The thread's one-time question: set up sketches for this game?
export function DreamsOfferCard({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const [dreams, setDreams] = useState<GameDreams | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchGameDreams(slug)
      .then((value) => {
        if (!cancelled) setDreams(value);
      })
      // Not the owner, or offline: the question stays plain text.
      .catch(() => {
        if (!cancelled) setDreams(null);
      });
    const stop = onGameDreamsChanged((changed, value) => {
      if (changed === slug) setDreams(value);
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [slug]);

  if (!dreams) return null;

  if (!dreams.on) return <p className="studio-proposal-muted">{t('statusView.dreamsOffer.declined')}</p>;
  if (dreams.wanted) return <p className="studio-proposal-muted">{t('statusView.dreamsOffer.accepted')}</p>;

  async function answer(want: boolean) {
    setBusy(true);
    setFailed(false);
    try {
      setDreams(await answerDreamsOffer(slug, want));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="studio-dreams-offer">
      <div className="studio-dreams-offer-actions">
        <button type="button" className="primary-btn" disabled={busy} onClick={() => void answer(true)}>
          {t('statusView.dreamsOffer.yes')}
        </button>
        <button type="button" className="secondary-btn" disabled={busy} onClick={() => void answer(false)}>
          {t('statusView.dreamsOffer.no')}
        </button>
      </div>
      {failed ? <p className="error">{t('statusView.dreamsOffer.failed')}</p> : null}
    </div>
  );
}

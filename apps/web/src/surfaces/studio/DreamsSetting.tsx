import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchGameDreams, onGameDreamsChanged, setGameDreams, type GameDreams } from '../../gameDreamsApi.js';

// This game's concept sketches; undoes the card's "turn off".
export function DreamsSetting({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const [dreams, setDreams] = useState<GameDreams | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    // Another game's switch must not stay clickable while this one loads.
    setDreams(null);
    setFailed(false);
    fetchGameDreams(slug)
      .then((value) => {
        if (!cancelled) setDreams(value);
      })
      // No switch to show must not break the overview.
      .catch(() => {
        if (!cancelled) setDreams(null);
      });
    const stop = onGameDreamsChanged((changed, value) => {
      if (changed === slug) setDreams(value);
    });
    return () => {
      cancelled = true;
      mountedRef.current = false;
      stop();
    };
  }, [slug]);

  if (!dreams) return null;

  async function toggle() {
    if (!dreams) return;
    const previous = dreams;
    setBusy(true);
    setFailed(false);
    // Optimistic: a switch that waits reads as a dead button.
    setDreams({ ...dreams, on: !dreams.on });
    try {
      await setGameDreams(slug, !previous.on);
    } catch {
      if (!mountedRef.current) return;
      setDreams(previous);
      setFailed(true);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  return (
    <div className="studio-share studio-dreams">
      <div className="studio-share-head">
        <h3 className="studio-share-title">{t('studioPanel.dreams.title')}</h3>
        <button
          type="button"
          role="switch"
          aria-checked={dreams.on}
          className={`studio-share-toggle${dreams.on ? ' is-on' : ''}`}
          onClick={() => void toggle()}
          disabled={busy}
        >
          <span className="studio-share-toggle-track" aria-hidden="true" />
          {dreams.on ? t('studioPanel.dreams.on') : t('studioPanel.dreams.off')}
        </button>
      </div>
      <p className="studio-share-hint">{t(dreams.on ? 'studioPanel.dreams.hintOn' : 'studioPanel.dreams.hintOff')}</p>
      {dreams.accountMuted ? <p className="studio-share-hint">{t('studioPanel.dreams.accountMuted')}</p> : null}
      {failed ? <p className="error">{t('studioPanel.dreams.failed')}</p> : null}
    </div>
  );
}

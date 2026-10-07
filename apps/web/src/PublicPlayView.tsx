import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GameLoadScreen } from './GameLoadScreen.js';
import { GameTheater } from './GameTheater.js';
import { PlayNotFoundPanel } from './PlayNotFoundPanel.js';
import { usePublishedGameFetch } from './usePublishedGameFetch.js';

export function PublicPlayView({ slug, onExit }: { slug: string; onExit: () => void }) {
  const { t } = useTranslation();
  const { game, progress, error: fetchError } = usePublishedGameFetch(slug);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fetchError) {
      setError(null);
      return;
    }
    const status = fetchError?.status;
    setError(status === 404 || status === 409 ? t('draft.notFound') : t('draft.error'));
  }, [fetchError, t]);

  useEffect(() => {
    if (error) return;
    document.body.classList.add('player-open');
    return () => document.body.classList.remove('player-open');
  }, [error]);

  if (error) {
    const isNotFound = fetchError?.status === 404 || fetchError?.status === 409;
    return <PlayNotFoundPanel isNotFound={isNotFound} error={error} onExit={onExit} />;
  }

  if (!game) {
    return <GameLoadScreen onExit={onExit} progress={progress} />;
  }

  return (
    <GameTheater
      title={game.title}
      badge={{ icon: 'sparkle', label: t('ai.generatedShort') }}
      source={{ html: game.html }}
      reportSlug={slug}
      remixable={false}
      onExit={onExit}
    />
  );
}

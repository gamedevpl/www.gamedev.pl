import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GameTheater } from './GameTheater.js';
import './PublicPlayView.css';

export function PublicPlayView({ slug, onExit }: { slug: string; onExit: () => void }) {
  const { t } = useTranslation();
  const framed = window.parent !== window;

  useEffect(() => {
    if (!framed) return;
    document.documentElement.classList.add('is-framed-play');
    return () => document.documentElement.classList.remove('is-framed-play');
  }, [framed]);

  return (
    <GameTheater
      title={slug}
      badge={{ icon: 'sparkle', label: t('ai.generatedShort') }}
      source={{ slug }}
      reportSlug={slug}
      remixable={false}
      onExit={framed ? () => undefined : onExit}
    />
  );
}

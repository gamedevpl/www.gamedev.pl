import { useTranslation } from 'react-i18next';
import { GameTheater } from './GameTheater.js';

export function PublicPlayView({ slug, onExit }: { slug: string; onExit: () => void }) {
  const { t } = useTranslation();

  return (
    <GameTheater
      title={slug}
      badge={{ icon: 'sparkle', label: t('ai.generatedShort') }}
      source={{ slug }}
      reportSlug={slug}
      remixable={false}
      onExit={onExit}
    />
  );
}

import { useTranslation } from 'react-i18next';
import { formatBuildTag } from '../../buildBarModel.js';

export function StudioPublicationStatus({
  published,
  publishedVersion,
  playingVersion,
  slug,
}: {
  published: boolean;
  publishedVersion?: string;
  playingVersion?: string | null;
  slug?: string;
}) {
  const { t } = useTranslation();
  const sameVersion = published && publishedVersion && playingVersion === publishedVersion;
  return (
    <section className="studio-publication-status" aria-label={t('studioPanel.buildHistory.publicationStatus')}>
      <div className="studio-publication-heading">
        <strong>{t(`studioPanel.buildHistory.${published ? 'publicVersion' : 'notPublished'}`)}</strong>
        {published && publishedVersion ? (
          <code title={publishedVersion}>{formatBuildTag(publishedVersion)}</code>
        ) : null}
      </div>
      <p>{t(`studioPanel.buildHistory.${published ? 'publicHint' : 'notPublishedHint'}`)}</p>
      {published && slug ? (
        <a
          className="studio-build-action-btn"
          href={`/play/${encodeURIComponent(slug)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('studioPanel.buildHistory.openPublic')}
        </a>
      ) : null}
      {playingVersion ? (
        <p className="studio-publication-preview">
          <span>
            {t('studioPanel.buildHistory.viewingPreview')}{' '}
            <code title={playingVersion}>{formatBuildTag(playingVersion)}</code>
          </span>
          <span>
            {t(
              `studioPanel.buildHistory.${sameVersion ? 'matchesPublic' : publishedVersion || !published ? 'previewOnly' : 'previewUnconfirmed'}`,
            )}
          </span>
        </p>
      ) : null}
    </section>
  );
}

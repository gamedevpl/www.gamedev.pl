import { useTranslation } from 'react-i18next';
import { Mascot } from './Mascot.js';

/**
 * Round 0, staging incomplete (Workstream C): the no-API fallback. Naming the missing
 * file would be the good version, but `listStagedSources` is reachable only through the
 * agent channel today (see the plan's "assembling checklist has an API dependency"
 * note) — so this says a build is coming together and defers to the thread beside it,
 * which already carries the agent's progress entries. Weaker than a checklist, but
 * still a deliberate stage rather than a void, which is the property that matters.
 */
export function StudioStageCard() {
  const { t } = useTranslation();
  return (
    <div className="studio-stage-card is-assembling" role="status" aria-live="polite">
      <Mascot emotion="busy" size={56} title={t('mascot.busyAlt')} />
      <p className="studio-stage-card-title">{t('studioPanel.stage.assembling')}</p>
      <p className="studio-stage-card-detail">{t('studioPanel.stage.assemblingHint')}</p>
    </div>
  );
}

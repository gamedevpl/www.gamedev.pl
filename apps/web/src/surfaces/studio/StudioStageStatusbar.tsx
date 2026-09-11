import { useTranslation } from 'react-i18next';
import { PixelIcon } from '../../PixelIcon.js';
import type { StageOrigin } from '../../useStageSource.js';
import type { StagePosture, StageStatus } from './StudioStage.js';
import { StudioVersionRibbon } from './StudioVersionRibbon.js';

export type StudioStageStatusbarProps = {
  shownOrigin: StageOrigin;
  publishedAt?: string;
  stageStatus: StageStatus;
  deliveryInGate?: boolean;
  newerStageWaiting?: boolean;
  checked?: boolean | null;
  posture: StagePosture;
  shownHtml: string | null;
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  onRequestWatch: () => void;
};

export function StudioStageStatusbar({
  shownOrigin,
  publishedAt,
  stageStatus,
  deliveryInGate,
  newerStageWaiting,
  checked,
  posture,
  shownHtml,
  paused,
  onPause,
  onResume,
  onRequestWatch,
}: StudioStageStatusbarProps) {
  const { t } = useTranslation();

  return (
    <footer className="studio-stage-statusbar">
      <div className="studio-stage-statusbar-row">
        <div className="studio-stage-statusbar-left">
          <StudioVersionRibbon
            origin={shownOrigin}
            publishedAt={publishedAt}
            stageStatus={stageStatus}
            deliveryInGate={deliveryInGate}
            newerStageWaiting={newerStageWaiting}
            checked={checked}
          />
        </div>
        <div className="studio-stage-statusbar-right">
          {posture === 'play' && shownHtml ? (
            <div className="studio-stage-play-bar">
              {paused ? (
                <button type="button" className="studio-stage-statusbar-btn secondary-btn" onClick={onResume}>
                  <PixelIcon name="play" size={11} /> <span className="btn-label">{t('studioPanel.playtest.resume')}</span>
                </button>
              ) : (
                <button type="button" className="studio-stage-statusbar-btn primary-btn" onClick={onPause}>
                  <PixelIcon name="pause" size={11} /> <span className="btn-label">{t('studioPanel.playtest.pause')}</span>
                </button>
              )}
              <button type="button" className="studio-stage-statusbar-btn secondary-btn" onClick={onRequestWatch}>
                <PixelIcon name="close" size={11} /> <span className="btn-label">{t('studioPanel.stage.stopPlaying')}</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </footer>
  );
}

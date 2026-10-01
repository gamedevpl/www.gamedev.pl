import { useTranslation } from 'react-i18next';
import { formatBuildTag } from '../../buildBarModel.js';
import type { StageCheck } from '../../stageCheckVerdict.js';
import type { StageOrigin } from '../../useStageSource.js';
import type { StageStatus } from './StudioStage.js';
import './studio-stage.css';

/**
 * The honesty organ (Workstream B2): names which build is actually on screen, and
 * reads only from the stage's own signals — never from agent prose. Three slots with
 * precedence, not an accumulating sentence: Identity is always shown; Exception, when
 * one exists, is the *worst* one and displaces Depth; Depth (how far this build has
 * been checked) shows only when nothing is wrong. Not dismissible.
 */

export type RibbonException =
  | { kind: 'crashed'; message: string }
  | { kind: 'drew-nothing' }
  | { kind: 'delivery-in-gate' }
  | { kind: 'newer-stage-waiting' };

export type StudioVersionRibbonProps = {
  origin: StageOrigin;
  publishedAt?: string;
  stageStatus: StageStatus;
  deliveryInGate?: boolean;
  newerStageWaiting?: boolean;
  /** The shown build's gate state; 'checking' is the normal fast path. */
  check?: StageCheck;
};

function worstException(props: StudioVersionRibbonProps): RibbonException | null {
  if (props.stageStatus.kind === 'crashed') return { kind: 'crashed', message: props.stageStatus.message };
  if (props.stageStatus.kind === 'drew-nothing') return { kind: 'drew-nothing' };
  if (props.newerStageWaiting) return { kind: 'newer-stage-waiting' };
  if (props.deliveryInGate) return { kind: 'delivery-in-gate' };
  return null;
}

function formatClock(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function StudioVersionRibbon(props: StudioVersionRibbonProps) {
  const { t } = useTranslation();
  const { origin } = props;
  if (origin.kind === 'none') return null;

  const tag = formatBuildTag(origin.version);
  // Lead with what is being played; when it landed comes second.
  const playing = tag ? t('studioPanel.ribbon.playingTag', { tag }) : t('studioPanel.ribbon.playing');
  const landed =
    origin.kind === 'delivered'
      ? props.publishedAt
        ? t('studioPanel.ribbon.delivered', { time: formatClock(Date.parse(props.publishedAt)) })
        : t('studioPanel.ribbon.deliveredUnknown')
      : origin.at != null
        ? t('studioPanel.ribbon.staged', { time: formatClock(origin.at) })
        : t('studioPanel.ribbon.stagedUnknown');
  const identity = origin.kind === 'seed' ? t('studioPanel.ribbon.seed') : `${playing} · ${landed}`;

  const exception = worstException(props);

  return (
    <div className={`studio-version-ribbon${exception ? ' has-exception' : ''}`} role="status" aria-live="polite">
      <span className="studio-version-ribbon-identity">{identity}</span>
      {exception ? (
        <span className="studio-version-ribbon-exception">
          {exception.kind === 'crashed'
            ? t('studioPanel.ribbon.crashed')
            : exception.kind === 'drew-nothing'
              ? t('studioPanel.ribbon.drewNothing')
              : exception.kind === 'delivery-in-gate'
                ? t('studioPanel.ribbon.deliveryInGate')
                : t('studioPanel.ribbon.newerStageWaiting')}
        </span>
      ) : props.check ? (
        <span
          className={`studio-version-ribbon-depth is-${props.check}`}
          title={t(`studioPanel.ribbon.${props.check}Title`)}
        >
          {t(`studioPanel.ribbon.${props.check}`)}
        </span>
      ) : null}
    </div>
  );
}

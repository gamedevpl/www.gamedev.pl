import { useTranslation } from 'react-i18next';
import { formatBuildTag } from '../../buildBarModel.js';
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
  /** Green/not-yet from the preview gate — the only depth signal available client-side today. */
  checked?: boolean | null;
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

  const tag = origin.versionLabel ? formatBuildTag(origin.versionLabel) : null;
  const tagSuffix = tag ? ` (${tag})` : '';

  const identity =
    origin.kind === 'delivered'
      ? props.publishedAt
        ? t('studioPanel.ribbon.delivered', { time: formatClock(Date.parse(props.publishedAt)) }) + tagSuffix
        : t('studioPanel.ribbon.deliveredUnknown') + tagSuffix
      : origin.kind === 'seed'
        ? t('studioPanel.ribbon.seed')
        : origin.at != null
          ? t('studioPanel.ribbon.staged', { time: formatClock(origin.at) }) + tagSuffix
          : t('studioPanel.ribbon.stagedUnknown') + tagSuffix;

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
      ) : props.checked != null ? (
        <span
          className={`studio-version-ribbon-depth${props.checked ? '' : ' is-failed'}`}
          title={props.checked ? t('studioPanel.ribbon.checkedTitle') : t('studioPanel.buildBar.failed')}
        >
          {props.checked ? t('studioPanel.ribbon.checked') : t('studioPanel.buildBar.failed')}
        </span>
      ) : null}
    </div>
  );
}

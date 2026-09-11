import { useTranslation } from 'react-i18next';
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
  if (props.deliveryInGate) return { kind: 'delivery-in-gate' };
  if (props.newerStageWaiting) return { kind: 'newer-stage-waiting' };
  return null;
}

function formatClock(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function StudioVersionRibbon(props: StudioVersionRibbonProps) {
  const { t } = useTranslation();
  const { origin } = props;
  if (origin.kind === 'none') return null;

  const identity =
    origin.kind === 'delivered'
      ? props.publishedAt
        ? t('studioPanel.ribbon.delivered', { time: formatClock(Date.parse(props.publishedAt)) })
        : t('studioPanel.ribbon.deliveredUnknown')
      : origin.kind === 'seed'
        ? t('studioPanel.ribbon.seed')
        : origin.at != null
          ? t('studioPanel.ribbon.staged', { time: formatClock(origin.at) })
          : t('studioPanel.ribbon.stagedUnknown');

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
          className="studio-version-ribbon-depth"
          title={props.checked ? t('studioPanel.ribbon.checkedTitle') : t('studioPanel.ribbon.notCheckedTitle')}
        >
          {props.checked ? t('studioPanel.ribbon.checked') : t('studioPanel.ribbon.notChecked')}
        </span>
      ) : null}
    </div>
  );
}

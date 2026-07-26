import type { CreatorsResponse } from './healthApi';

/**
 * Creator return and build economics — the two figures docs/gtm-plan.md gates Stage 0 on.
 *
 * Kept beside the visit funnel because they are the same question from the other side:
 * the funnel shows people arriving and trying to create, this shows whether the ones who
 * succeeded came back and what their build cost in wall-clock time.
 */

function minutes(value: number | null): string {
  if (value === null) return '—';
  if (value < 60) return `${value}m`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function CreatorMetricsPanel({ data }: { data: CreatorsResponse }) {
  const { metrics } = data;

  if (metrics.published === 0) {
    return (
      <section className="funnel">
        <h2>Creators</h2>
        <p className="health-empty">No games have published yet.</p>
      </section>
    );
  }

  const rate = metrics.d7ReturnRate;

  return (
    <section className="funnel">
      <h2>Creators</h2>

      <ul className="funnel-stats">
        <li>
          <span className="funnel-stat-value">{rate === null ? '—' : `${Math.round(rate * 100)}%`}</span>
          <span className="funnel-stat-label">came back within 7 days</span>
        </li>
        <li>
          <span className="funnel-stat-value">{metrics.creators}</span>
          <span className="funnel-stat-label">creators published</span>
        </li>
        <li>
          <span className="funnel-stat-value">
            {metrics.gamesPerCreator === null ? '—' : metrics.gamesPerCreator.toFixed(1)}
          </span>
          <span className="funnel-stat-label">games / creator</span>
        </li>
        <li>
          <span className="funnel-stat-value">{minutes(metrics.medianBuildMinutes)}</span>
          <span className="funnel-stat-label">median build</span>
        </li>
        <li>
          <span className="funnel-stat-value">{minutes(metrics.p90BuildMinutes)}</span>
          <span className="funnel-stat-label">slowest 10% of builds</span>
        </li>
      </ul>

      <p className="health-note">
        {/*
          Stated rather than left implicit: a rate over a handful of creators is not a
          measurement, and the Stage 0 gate is a real decision to make on this number.
        */}
        {rate === null ? (
          <>
            No creator has had a full 7 days since publishing yet, so the return rate is not
            measurable — {metrics.published} game{metrics.published === 1 ? '' : 's'} published so
            far, from {data.sampled} sampled.
          </>
        ) : (
          <>
            {metrics.returnedWithin7Days} of {metrics.eligibleForReturn} creator
            {metrics.eligibleForReturn === 1 ? '' : 's'} whose 7 days have elapsed. Creators who
            published more recently are excluded rather than counted as not returning.
          </>
        )}
      </p>
    </section>
  );
}

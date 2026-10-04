import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GamePerformanceResponse, ReviewerCohort } from '@gamedevpl/contract';
import { fetchGamePerformance } from '../../gamePerformanceApi.js';
import './studio-performance.css';

export function StudioPerformance({ slug, days }: { slug: string; days: number }) {
  const { t } = useTranslation();
  const [reviewers, setReviewers] = useState<ReviewerCohort>('include');
  const [version, setVersion] = useState('');
  const [report, setReport] = useState<GamePerformanceResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    setVersion('');
  }, [slug]);
  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setReport(null);
    fetchGamePerformance({
      slug,
      days,
      performanceReviewers: reviewers,
      ...(version ? { artifactVersion: version } : {}),
    })
      .then((result) => {
        if (!cancelled) {
          setReport(result);
          setState('ready');
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : '');
          setState('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug, days, reviewers, version, reload]);
  const bound = (value: number | null, hasIntervals: boolean) =>
    value === null ? (hasIntervals ? '>1000 ms' : '—') : `${value} ms`;
  return (
    <section className="studio-performance" aria-label={t('studioPerformance.title')}>
      <h3>{t('studioPerformance.title')}</h3>
      <div className="studio-performance-filters">
        <label>
          {t('studioPerformance.cohort')}
          <select value={reviewers} onChange={(event) => setReviewers(event.target.value as ReviewerCohort)}>
            <option value="include">{t('studioPerformance.include')}</option>
            <option value="exclude">{t('studioPerformance.exclude')}</option>
            <option value="only">{t('studioPerformance.only')}</option>
          </select>
        </label>
        <label>
          {t('studioPerformance.version')}
          <select value={version} onChange={(event) => setVersion(event.target.value)}>
            <option value="">{t('studioPerformance.allVersions')}</option>
            {(report?.availableVersions ?? (version ? [version] : [])).map((build) => (
              <option key={build} value={build}>
                {build.slice(0, 12)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {state === 'loading' && <p role="status">{t('studioPerformance.loading')}</p>}
      {state === 'error' && (
        <div role="alert">
          <p>
            {t(
              error === '404'
                ? 'studioPerformance.denied'
                : error === '429'
                  ? 'studioPerformance.rateLimited'
                  : 'studioPerformance.failed',
            )}
          </p>
          <button type="button" onClick={() => setReload((value) => value + 1)}>
            {t('studioPerformance.retry')}
          </button>
        </div>
      )}
      {state === 'ready' && report && (
        <>
          <p className="studio-performance-coverage">
            {t('studioPerformance.coverage', {
              measured: report.measuredSessions,
              unmeasured: report.unmeasuredSessions,
            })}
          </p>
          {(report.scanTruncated || report.groupsTruncated || report.versionsTruncated) && (
            <p role="status">{t('studioPerformance.truncated')}</p>
          )}
          {report.status !== 'measured' && (
            <p>
              {t(report.status === 'no_traffic' ? 'studioPerformance.noTraffic' : 'studioPerformance.noValidWindows')}
            </p>
          )}
          {report.groups.map((group, index) => (
            <details key={index} className="studio-performance-group">
              <summary>
                <span className="studio-performance-device">
                  <strong>
                    {group.device?.deviceClass ?? t('studioPerformance.unknown')} ·{' '}
                    {group.device?.system ?? t('studioPerformance.unknown')}
                  </strong>
                  <span>
                    {group.device?.browser ?? t('studioPerformance.unknown')} {group.device?.browserMajor ?? ''} ·{' '}
                    {group.reviewer ? t('studioPerformance.reviewer') : t('studioPerformance.player')}
                  </span>
                  <span>
                    {group.viewportWidth}×{group.viewportHeight} · DPR {group.dpr} ·{' '}
                    {t('studioPerformance.sessions', { count: group.sessions })}
                  </span>
                </span>
                <span className="studio-performance-fps">
                  <strong>{group.rafFps.toFixed(1)}</strong>
                  <span>rAF FPS</span>
                </span>
              </summary>
              <dl>
                <dt>{t('studioPerformance.build')}</dt>
                <dd className="studio-performance-build">{group.artifactVersion ?? t('studioPerformance.unknown')}</dd>
                <dt>{t('studioPerformance.sample')}</dt>
                <dd>
                  {t('studioPerformance.sampleValue', {
                    sessions: group.sessions,
                    windows: group.windows,
                    seconds: (group.observedMs / 1000).toFixed(1),
                  })}
                </dd>
                <dt>{t('studioPerformance.fps')}</dt>
                <dd>
                  {group.rafFps.toFixed(1)} / {group.renderedFps?.toFixed(1) ?? '—'}
                </dd>
                <dt>{t('studioPerformance.viewport')}</dt>
                <dd>
                  {group.viewportWidth}×{group.viewportHeight}
                </dd>
                <dt>{t('studioPerformance.canvas')}</dt>
                <dd>
                  {group.canvasWidth}×{group.canvasHeight} / {group.canvasCssWidth}×{group.canvasCssHeight}
                </dd>
                <dt>{t('studioPerformance.dpr')}</dt>
                <dd>
                  {group.dpr} / {group.device?.displayDpr ?? '—'}
                </dd>
                <dt>{t('studioPerformance.screen')}</dt>
                <dd>
                  {group.device?.screenWidth ?? '—'}×{group.device?.screenHeight ?? '—'}
                </dd>
                <dt>{t('studioPerformance.hardware')}</dt>
                <dd>
                  {group.device?.cpuBucket ?? '—'} / {group.device?.memoryBucket ?? '—'}
                </dd>
                <dt>{t('studioPerformance.state')}</dt>
                <dd>
                  {group.state} / {group.gfxBackend ?? '—'} / {group.orientation}
                </dd>
                <dt>{t('studioPerformance.percentiles')}</dt>
                <dd>
                  {bound(
                    group.p95GapUpperMs,
                    group.intervals.some((n) => n > 0),
                  )}{' '}
                  /{' '}
                  {bound(
                    group.p99GapUpperMs,
                    group.intervals.some((n) => n > 0),
                  )}
                </dd>
                <dt>{t('studioPerformance.gaps')}</dt>
                <dd>
                  {group.maxGapMs.toFixed(1)} ms / {group.gapsOver100Ms} / {group.gapsOver250Ms}
                </dd>
              </dl>
            </details>
          ))}
          <details className="studio-performance-method">
            <summary>{t('studioPerformance.method')}</summary>
            <p>
              {t('studioPerformance.freshness', {
                at: new Date(report.measuredAt).toLocaleString(),
                until: new Date(report.freshUntil).toLocaleTimeString(),
              })}
            </p>
            {report.days.length > 0 && (
              <p>{t('studioPerformance.range', { from: report.days.at(-1), to: report.days[0] })}</p>
            )}
            <p>
              {t('studioPerformance.exclusions', {
                invalid: report.invalidWindows,
                agents: report.agentEventsExcluded,
                legacy: report.aliveWithoutPerformance,
              })}
            </p>
            <p>{t('studioPerformance.limitations')}</p>
          </details>
        </>
      )}
    </section>
  );
}

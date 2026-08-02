import { type VisitFunnel, type VisitsResponse } from './healthApi.js';

/**
 * The visit funnel, rendered beside game health on the operator page.
 *
 * Game health answers "is this game working". This answers the questions that come
 * before that and which no per-game view can reach: how many arrivals there were, how
 * many reached a game at all, how fast, how deep, and where they came from.
 *
 * Untranslated for the same reason as the rest of this page — a single-operator
 * surface no player can reach.
 */

function percent(part: number, whole: number): string {
  if (whole === 0) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}

/** Human labels for the creation steps; the API sends the machine names. */
const STEP_LABELS: Record<string, string> = {
  prompt_started: 'started writing',
  spec_submitted: 'pressed create',
  signin_required: 'hit sign-in wall',
  qa_shown: 'asked questions',
  submission_created: 'game submitted',
};

const WAITLIST_LABELS: Record<string, string> = {
  cta_clicked: 'clicked Join waitlist',
  joined: 'joined waitlist',
};

const EDITOR_LABELS: Record<string, string> = {
  opened: 'opened the editor',
  draft_saved: 'saved a draft',
  previewed: 'played the draft',
  published: 'published changes',
};

const REMIX_LABELS: Record<string, string> = {
  opened: 'opened a remix',
  typed: 'typed a request',
  wall_shown: 'hit the sign-in wall',
  signed_in: 'came through the wall',
  tuned: 'moved a slider',
  asked: 'typed a request',
  applied: 'got a change applied',
  handoff: 'told it needs more',
  refused: 'was refused',
  shared: 'shared their version',
  keep_clicked: 'clicked "make it mine"',
};

const ASSIST_LABELS: Record<string, string> = {
  asked: 'typed a tuning request',
  applied: 'got a change applied',
  handoff: 'told it needs a code change',
  rejected: 'refused (moderation, quota, or no answer)',
};

const HOW_TO_VIA_LABELS: Record<string, string> = {
  bar: 'theater bar',
  more: 'More menu',
  unknown: 'unknown (pre-via clients)',
};

const HOW_TO_ENTRY_LABELS: Record<string, string> = {
  play: 'deep link (/play)',
  home: 'arcade (home)',
};

function bucketLabel(upToSeconds: number | null): string {
  if (upToSeconds === null) return 'slower';
  if (upToSeconds < 60) return `≤ ${upToSeconds}s`;
  return `≤ ${Math.round(upToSeconds / 60)}m`;
}

/** A labelled count with its share of visits, for the small ranked tables. */
function RankedRows({ rows, whole }: { rows: Array<{ label: string; visits: number; plays: number }>; whole: number }) {
  return (
    <tbody>
      {rows.map((row) => (
        <tr key={row.label}>
          <td>{row.label}</td>
          <td className="num">{row.visits}</td>
          <td className="num">{percent(row.visits, whole)}</td>
          <td className="num">{row.plays}</td>
        </tr>
      ))}
    </tbody>
  );
}

export function VisitFunnelPanel({ data }: { data: VisitsResponse }) {
  const funnel: VisitFunnel = data.funnel;

  if (funnel.visits === 0) {
    return (
      <section className="funnel">
        <h2>Visits</h2>
        <p className="health-empty">No visits recorded in this window.</p>
      </section>
    );
  }

  const campaignRows = funnel.campaigns.map((row) => ({
    label: [row.source, row.medium, row.campaign].filter(Boolean).join(' / ') || 'unnamed',
    visits: row.visits,
    plays: row.plays,
  }));

  return (
    <section className="funnel">
      <h2>Visits</h2>

      <ul className="funnel-stats">
        <li>
          <span className="funnel-stat-value">{funnel.visits}</span>
          <span className="funnel-stat-label">visits</span>
        </li>
        <li>
          <span className="funnel-stat-value">{percent(funnel.visitsWithPlay, funnel.visits)}</span>
          <span className="funnel-stat-label">reached a game</span>
        </li>
        <li>
          <span className="funnel-stat-value">{funnel.bounces}</span>
          <span className="funnel-stat-label">left without playing</span>
        </li>
        <li>
          <span className="funnel-stat-value">
            {funnel.visitsWithPlay > 0 ? `${funnel.medianSecondsToFirstPlay}s` : '—'}
          </span>
          <span className="funnel-stat-label">median to first play</span>
        </li>
        <li>
          <span className="funnel-stat-value">
            {funnel.visitsWithPlay > 0 ? funnel.medianPlaysPerPlayingVisit : '—'}
          </span>
          <span className="funnel-stat-label">median games / playing visit</span>
        </li>
      </ul>

      <div className="funnel-grid">
        <div className="funnel-block">
          <h3>Time to first play</h3>
          {funnel.timeToFirstPlay.length === 0 ? (
            <p className="health-empty">No visit reached a game.</p>
          ) : (
            <table className="health-table">
              <thead>
                <tr>
                  <th scope="col">Within</th>
                  <th scope="col" className="num">
                    Visits
                  </th>
                </tr>
              </thead>
              <tbody>
                {funnel.timeToFirstPlay.map((row) => (
                  <tr key={String(row.upToSeconds)}>
                    <td>{bucketLabel(row.upToSeconds)}</td>
                    <td className="num">{row.visits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="funnel-block">
          <h3>Games per visit</h3>
          {funnel.depth.length === 0 ? (
            <p className="health-empty">No visit reached a game.</p>
          ) : (
            <table className="health-table">
              <thead>
                <tr>
                  <th scope="col">Games</th>
                  <th scope="col" className="num">
                    Visits
                  </th>
                </tr>
              </thead>
              <tbody>
                {funnel.depth.map((row) => (
                  <tr key={row.plays}>
                    <td>{row.plays}</td>
                    <td className="num">{row.visits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="funnel-block">
          <h3>Creating</h3>
          {funnel.creating.every((row) => row.visits === 0) ? (
            <p className="health-empty">Nobody started a game in this window.</p>
          ) : (
            <table className="health-table">
              <thead>
                <tr>
                  <th scope="col">Step</th>
                  <th scope="col" className="num">
                    Visits
                  </th>
                  <th scope="col" className="num">
                    Of starters
                  </th>
                </tr>
              </thead>
              <tbody>
                {funnel.creating.map((row) => (
                  <tr key={row.step}>
                    <td>{STEP_LABELS[row.step] ?? row.step}</td>
                    <td className="num">{row.visits}</td>
                    {/*
                     * Measured against the first rung, not against all visits: the
                     * question is how many people who tried to make a game got one,
                     * and most visitors never try.
                     */}
                    <td className="num">{percent(row.visits, funnel.creating[0]?.visits ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="funnel-block">
          <h3>Waitlist</h3>
          {funnel.waitlist.every((row) => row.visits === 0) ? (
            <p className="health-empty">Nobody clicked Join waitlist in this window.</p>
          ) : (
            <table className="health-table">
              <thead>
                <tr>
                  <th scope="col">Step</th>
                  <th scope="col" className="num">
                    Visits
                  </th>
                  <th scope="col" className="num">
                    Of clicks
                  </th>
                </tr>
              </thead>
              <tbody>
                {funnel.waitlist.map((row) => (
                  <tr key={row.step}>
                    <td>{WAITLIST_LABELS[row.step] ?? row.step}</td>
                    <td className="num">{row.visits}</td>
                    <td className="num">{percent(row.visits, funnel.waitlist[0]?.visits ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="funnel-block">
          <h3>Remix</h3>
          {(funnel.remixing ?? []).every((row) => row.visits === 0) ? (
            <p className="health-empty">Nobody opened a remix in this window.</p>
          ) : (
            <table className="health-table">
              <thead>
                <tr>
                  <th scope="col">Step</th>
                  <th scope="col" className="num">
                    Visits
                  </th>
                  <th scope="col" className="num">
                    Of openers
                  </th>
                </tr>
              </thead>
              <tbody>
                {(funnel.remixing ?? []).map((row) => (
                  <tr key={row.step}>
                    <td>{REMIX_LABELS[row.step] ?? row.step}</td>
                    <td className="num">{row.visits}</td>
                    {/*
                     * The second row against the first is the whole thesis: of the
                     * players handed a slider, how many touch it. Everything below
                     * is read the same way rather than as a strict ladder — sharing
                     * without typing is a normal path, not a leak.
                     */}
                    <td className="num">{percent(row.visits, funnel.remixing?.[0]?.visits ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="funnel-block">
          <h3>Tuning assistant</h3>
          {(funnel.assisting ?? []).every((row) => row.visits === 0) ? (
            <p className="health-empty">Nobody typed a tuning request in this window.</p>
          ) : (
            <table className="health-table">
              <thead>
                <tr>
                  <th scope="col">Outcome</th>
                  <th scope="col" className="num">
                    Visits
                  </th>
                  <th scope="col" className="num">
                    Of askers
                  </th>
                </tr>
              </thead>
              <tbody>
                {(funnel.assisting ?? []).map((row) => (
                  <tr key={row.step}>
                    <td>{ASSIST_LABELS[row.step] ?? row.step}</td>
                    <td className="num">{row.visits}</td>
                    {/*
                     * Against `asked`, not against editor opens: this block answers
                     * what the router does when it is used, and the share of editing
                     * sittings that use it at all is the first row's own number.
                     */}
                    <td className="num">{percent(row.visits, funnel.assisting?.[0]?.visits ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="funnel-block">
          <h3>Editing</h3>
          {funnel.editing.every((row) => row.visits === 0) ? (
            <p className="health-empty">Nobody opened a game editor in this window.</p>
          ) : (
            <table className="health-table">
              <thead>
                <tr>
                  <th scope="col">Step</th>
                  <th scope="col" className="num">
                    Visits
                  </th>
                  <th scope="col" className="num">
                    Of openers
                  </th>
                </tr>
              </thead>
              <tbody>
                {funnel.editing.map((row) => (
                  <tr key={row.step}>
                    <td>{EDITOR_LABELS[row.step] ?? row.step}</td>
                    <td className="num">{row.visits}</td>
                    {/*
                     * Against the first rung, like Creating: the question is how far
                     * someone who opened the editor got, not what share of all traffic
                     * edits — almost none of it will, and that is fine.
                     */}
                    <td className="num">{percent(row.visits, funnel.editing[0]?.visits ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="funnel-block">
          <h3>How to play</h3>
          {funnel.howToPlay.opens === 0 ? (
            <p className="health-empty">Nobody opened How to play in this window.</p>
          ) : (
            <>
              {/*
               * Open rate is visits-that-opened / playing visits — not opens / plays.
               * Repeat rate is same-card reopens (`reopen: true`), not "opened twice in
               * the visit" (which would count one open per game in a multi-game sitting).
               */}
              <p className="funnel-howto-summary">
                {percent(funnel.howToPlay.visits, funnel.visitsWithPlay)} of playing visits opened the card (
                {funnel.howToPlay.visits} of {funnel.visitsWithPlay}). {funnel.howToPlay.opens} opens total;{' '}
                {percent(funnel.howToPlay.repeatVisits, funnel.howToPlay.visits)} reopened the same card.
              </p>
              <table className="health-table">
                <thead>
                  <tr>
                    <th scope="col">Opened from</th>
                    <th scope="col" className="num">
                      Opens
                    </th>
                    <th scope="col" className="num">
                      Visits
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {funnel.howToPlay.via.map((row) => (
                    <tr key={row.via}>
                      <td>{HOW_TO_VIA_LABELS[row.via] ?? row.via}</td>
                      <td className="num">{row.opens}</td>
                      <td className="num">{row.visits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {funnel.howToPlay.byEntry.length > 0 && (
                <table className="health-table">
                  <thead>
                    <tr>
                      <th scope="col">Visit landed on</th>
                      <th scope="col" className="num">
                        Playing
                      </th>
                      <th scope="col" className="num">
                        Opened
                      </th>
                      <th scope="col" className="num">
                        Rate
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {funnel.howToPlay.byEntry.map((row) => (
                      <tr key={row.entry}>
                        <td>{HOW_TO_ENTRY_LABELS[row.entry] ?? row.entry}</td>
                        <td className="num">{row.playingVisits}</td>
                        <td className="num">{row.visits}</td>
                        <td className="num">{percent(row.visits, row.playingVisits)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>

        <div className="funnel-block">
          <h3>Landed on</h3>
          <table className="health-table">
            <thead>
              <tr>
                <th scope="col">Route</th>
                <th scope="col" className="num">
                  Visits
                </th>
                <th scope="col" className="num">
                  Share
                </th>
                <th scope="col" className="num">
                  Plays
                </th>
              </tr>
            </thead>
            <RankedRows
              rows={funnel.entries.map((row) => ({ label: row.entry, visits: row.visits, plays: row.plays }))}
              whole={funnel.visits}
            />
          </table>
        </div>

        <div className="funnel-block">
          <h3>Came from</h3>
          <table className="health-table">
            <thead>
              <tr>
                <th scope="col">Referrer</th>
                <th scope="col" className="num">
                  Visits
                </th>
                <th scope="col" className="num">
                  Share
                </th>
                <th scope="col" className="num">
                  Plays
                </th>
              </tr>
            </thead>
            <RankedRows
              rows={funnel.referrers.map((row) => ({ label: row.referrer, visits: row.visits, plays: row.plays }))}
              whole={funnel.visits}
            />
          </table>
        </div>

        {campaignRows.length > 0 && (
          <div className="funnel-block">
            <h3>Campaigns</h3>
            <table className="health-table">
              <thead>
                <tr>
                  <th scope="col">source / medium / campaign</th>
                  <th scope="col" className="num">
                    Visits
                  </th>
                  <th scope="col" className="num">
                    Share
                  </th>
                  <th scope="col" className="num">
                    Plays
                  </th>
                </tr>
              </thead>
              <RankedRows rows={campaignRows} whole={funnel.visits} />
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

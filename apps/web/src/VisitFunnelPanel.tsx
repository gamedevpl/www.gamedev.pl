import { type VisitFunnel, type VisitsResponse } from './healthApi.js';

/**
 * The visit funnel, rendered beside game health on the operator page.
 *
 * Game health answers "is this game working". This answers the questions that come
 * before that and which no per-game view can reach: how many arrivals there were, how
 * many reached a game at all, how fast, how deep, and where they came from.
 *
 * Time-to-first-play and games-per-visit distributions live in TelemetryOverview at
 * the top of the tab (histograms); this panel keeps the medians in its headline row
 * and the acquisition / creation / edit funnels below.
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

const INVITE_LABELS: Record<string, string> = {
  opened: 'opened an invite',
  accepted: 'accepted an invite',
  unavailable: 'hit an unavailable invite',
};

const BETA_WELCOME_LABELS: Record<string, string> = {
  shown: 'saw the welcome',
  continued: 'entered the beta',
  dismissed: 'dismissed the welcome',
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
  painted: 'painted a map',
  asked: 'typed a request',
  applied: 'got a change applied',
  handoff: 'told it needs more',
  refused: 'was refused',
  shared: 'shared their version',
  keep_clicked: 'clicked "make it mine"',
  proposed: 'sent a proposal',
};

const REMIX_VIA_LABELS: Record<string, string> = {
  redirect: 'prompt hand-off',
  menu: 'More menu',
  panel: 'only lane (flags off)',
  unknown: 'unknown (pre-via clients)',
};

const CODE_LABELS: Record<string, string> = {
  offered: 'was shown the Code control',
  opened: 'opened the Code surface',
  file_opened: 'opened a file',
  edited: 'edited a file',
  typechecked: 'ran a typecheck',
  previewed: 'staged a preview',
  delivered: 'delivered a build',
  published: 'published from Code',
  read_only_agent: 'hit the agent-round lock',
  conflict_seen: 'saw a staging conflict',
  round_reopened: 'opened a fresh round via staging (CE-17)',
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

const PLAY_VIA_LABELS: Record<string, string> = {
  featured: 'featured slot',
  rail_start_here: 'Start here rail',
  rail_continue: 'Continue playing rail',
  rail_party: 'Party mode rail',
  rail_new: 'Recently added rail',
  grid: 'catalog grid',
  composer_match: 'composer match card',
  create_showcase: '/create showcase',
  shelf: 'catalog shelf',
  featured_similar: 'featured "more like this"',
  party_page: '/party rail',
  unknown: 'unknown (direct link, etc.)',
};

const HOW_TO_ENTRY_LABELS: Record<string, string> = {
  play: 'deep link (/play)',
  home: 'catalog (home)',
};

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
  const remixRows = (funnel.remixing ?? []).filter((row) => row.step !== 'no_lane');
  const remixNoLane = (funnel.remixing ?? []).find((row) => row.step === 'no_lane')?.visits ?? 0;

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
          <h3>Plays by surface</h3>
          {(funnel.playVia ?? []).every((row) => row.plays === 0) ? (
            <p className="health-empty">Nobody played a game in this window.</p>
          ) : (
            <table className="health-table">
              <thead>
                <tr>
                  <th scope="col">Surface</th>
                  <th scope="col" className="num">
                    Plays
                  </th>
                  <th scope="col" className="num">
                    Of plays
                  </th>
                </tr>
              </thead>
              <tbody>
                {(funnel.playVia ?? []).map((row) => (
                  <tr key={row.via}>
                    <td>{PLAY_VIA_LABELS[row.via] ?? row.via}</td>
                    <td className="num">{row.plays}</td>
                    <td className="num">{percent(row.plays, funnel.plays)}</td>
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
          <h3>Invites</h3>
          {(funnel.invites ?? []).every((row) => row.visits === 0) ? (
            <p className="health-empty">Nobody opened an invite in this window.</p>
          ) : (
            <table className="health-table">
              <thead>
                <tr>
                  <th scope="col">Step</th>
                  <th scope="col" className="num">
                    Visits
                  </th>
                  <th scope="col" className="num">
                    Of opens
                  </th>
                </tr>
              </thead>
              <tbody>
                {(funnel.invites ?? []).map((row) => (
                  <tr key={row.step}>
                    <td>{INVITE_LABELS[row.step] ?? row.step}</td>
                    <td className="num">{row.visits}</td>
                    <td className="num">{percent(row.visits, funnel.invites?.[0]?.visits ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="funnel-block">
          <h3>Beta welcome</h3>
          {(funnel.betaWelcome ?? []).every((row) => row.visits === 0) ? (
            <p className="health-empty">No first-login welcomes in this window.</p>
          ) : (
            <table className="health-table">
              <thead>
                <tr>
                  <th scope="col">Step</th>
                  <th scope="col" className="num">
                    Visits
                  </th>
                  <th scope="col" className="num">
                    Of welcomes
                  </th>
                </tr>
              </thead>
              <tbody>
                {(funnel.betaWelcome ?? []).map((row) => (
                  <tr key={row.step}>
                    <td>{BETA_WELCOME_LABELS[row.step] ?? row.step}</td>
                    <td className="num">{row.visits}</td>
                    <td className="num">{percent(row.visits, funnel.betaWelcome?.[0]?.visits ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="funnel-block">
          <h3>Remix</h3>
          {remixRows.every((row) => row.visits === 0) ? (
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
                {remixRows.map((row) => (
                  <tr key={row.step}>
                    <td>{REMIX_LABELS[row.step] ?? row.step}</td>
                    <td className="num">{row.visits}</td>
                    {/*
                     * The second row against the first is the whole thesis: of the
                     * players handed a slider, how many touch it. Everything below
                     * is read the same way rather than as a strict ladder — sharing
                     * without typing is a normal path, not a leak.
                     */}
                    <td className="num">{percent(row.visits, remixRows[0]?.visits ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {remixNoLane > 0 ? <p className="health-note">No editor lane: {remixNoLane}</p> : null}
          {(funnel.remixPaintedVia ?? []).some((row) => row.visits > 0) ? (
            /*
             * One line, not a table: the door split exists to settle a single
             * hypothesis (does the prompt's redirect or the menu bring people
             * to the brush), and it only means anything while `painted` > 0.
             */
            <p className="health-note">
              Painter door:{' '}
              {(funnel.remixPaintedVia ?? [])
                .map((row) => `${REMIX_VIA_LABELS[row.via] ?? row.via} ${row.visits}`)
                .join(' · ')}
            </p>
          ) : null}
          {funnel.remixEntry ? (
            /*
             * Is the entry earning its place? The control moved off the game and
             * onto the chrome bar, which is quieter by design — this is the line
             * that says what quieter cost. `offered` is every visit shown it.
             *
             * `—` rather than `0s` when nobody opened one: no evidence is not a
             * measurement of instant interest, and this panel renders the
             * distinction everywhere else too.
             */
            <p className="health-note">
              Remix entry: {funnel.remixEntry.opened} of {funnel.remixEntry.offered} visits shown it opened it (
              {percent(funnel.remixEntry.opened, funnel.remixEntry.offered)})
              {funnel.remixEntry.opened > 0 ? (
                <>
                  {' · '}
                  {funnel.remixEntry.byControl.map((row) => `${row.control} ${row.visits}`).join(' · ')}
                  {' · median '}
                  {funnel.remixEntry.medianSecondsToOpen === null
                    ? '—'
                    : `${funnel.remixEntry.medianSecondsToOpen}s into the visit`}
                </>
              ) : null}
            </p>
          ) : null}
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
          <h3>Code surface</h3>
          {(funnel.coding ?? []).every((row) => row.visits === 0) ? (
            <p className="health-empty">Nobody was shown the Code control in this window.</p>
          ) : (
            <table className="health-table">
              <thead>
                <tr>
                  <th scope="col">Step</th>
                  <th scope="col" className="num">
                    Visits
                  </th>
                  <th scope="col" className="num">
                    Of offered
                  </th>
                </tr>
              </thead>
              <tbody>
                {(funnel.coding ?? []).map((row) => (
                  <tr key={row.step}>
                    <td>{CODE_LABELS[row.step] ?? row.step}</td>
                    <td className="num">{row.visits}</td>
                    <td className="num">{percent(row.visits, funnel.coding?.[0]?.visits ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {funnel.completion?.requests ? (
          <div className="funnel-block">
            <h3>Code completion</h3>
            <p className="health-summary">
              {funnel.completion.requests} requests · {funnel.completion.shown} shown · {funnel.completion.empty} empty
              · {funnel.completion.failed} failed
            </p>
            <table className="health-table">
              <thead>
                <tr>
                  <th scope="col">Lane</th>
                  <th scope="col" className="num">
                    Requests
                  </th>
                  <th scope="col" className="num">
                    Median
                  </th>
                  <th scope="col" className="num">
                    P90
                  </th>
                </tr>
              </thead>
              <tbody>
                {funnel.completion.byKind.map((row) => (
                  <tr key={row.kind}>
                    <td>{row.kind === 'language_service' ? 'TypeScript' : 'Ghost text'}</td>
                    <td className="num">{row.requests}</td>
                    <td className="num">{row.medianLatencyMs === null ? '—' : `${row.medianLatencyMs} ms`}</td>
                    <td className="num">{row.p90LatencyMs === null ? '—' : `${row.p90LatencyMs} ms`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

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

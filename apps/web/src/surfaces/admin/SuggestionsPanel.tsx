import { useEffect, useState } from 'react';
import { fetchSuggestions, type Suggestion, type SuggestionsResponse } from './adminApi.js';

/**
 * What the improvement router would say about every game it can see.
 *
 * Nothing here files, assigns or notifies — that is the point of looking at it. The
 * router will eventually open work against people's games, and the honest order is to
 * let an operator watch what it *would* do for a while first. This is the surface that
 * makes "for a while" possible; until now the endpoint answered only to curl.
 *
 * The `untrustedContext` block is game- and player-written text. It is rendered as text
 * and never interpolated anywhere else — which is exactly why it is worth showing beside
 * the numbers rather than hidden: a human reading it is the safe consumer.
 */

const CLASS_COPY: Record<Suggestion['class'], string> = {
  defect: 'defect',
  friction: 'friction',
  'design-change': 'design change',
  editorial: 'editorial review',
  healthy: 'healthy',
  'insufficient-data': 'not enough data',
};

function SuggestionRow({ suggestion }: { suggestion: Suggestion }) {
  const errors = suggestion.untrustedContext.errorSamples;
  const themes = suggestion.untrustedContext.feedbackThemes;

  return (
    <tr>
      <td className="health-slug">
        <a href={`/play/${suggestion.slug}`}>{suggestion.slug}</a>
      </td>
      <td>
        <span className={`admin-suggestion-class admin-suggestion-class--${suggestion.class}`}>
          {CLASS_COPY[suggestion.class]}
        </span>
      </td>
      <td>{Math.round(suggestion.priority * 100) / 100}</td>
      <td>
        {suggestion.evidence.length === 0 ? (
          '—'
        ) : (
          <ul className="admin-suggestion-evidence">
            {suggestion.evidence.map((item) => (
              <li key={item.finding}>{item.finding}</li>
            ))}
          </ul>
        )}
      </td>
      <td>
        {errors.length === 0 && themes.length === 0 ? (
          '—'
        ) : (
          <details className="health-disclosure">
            <summary>{errors.length + themes.length}</summary>
            <ul>
              {errors.map((sample) => (
                <li key={`e:${sample.message}`}>
                  <span className="health-error-count">{sample.count}×</span> {sample.message}
                </li>
              ))}
              {themes.map((theme) => (
                <li key={`t:${theme.theme}`}>
                  <span className="health-error-count">{theme.count}×</span> {theme.theme}
                </li>
              ))}
            </ul>
          </details>
        )}
      </td>
    </tr>
  );
}

export function SuggestionsPanel() {
  const [data, setData] = useState<SuggestionsResponse | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    fetchSuggestions()
      .then((response) => {
        if (cancelled) return;
        if (response === null) {
          setState('forbidden');
          return;
        }
        setData(response);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'forbidden') return <p className="health-empty">Not found.</p>;
  if (state === 'loading') return <p className="health-empty">Running the router…</p>;
  if (state === 'error' || !data) return <p className="health-empty">Could not run the router.</p>;

  const actionable = data.suggestions.filter(
    (suggestion) => suggestion.class !== 'healthy' && suggestion.class !== 'insufficient-data',
  );

  return (
    <section className="admin-suggestions">
      <h2 className="health-section-title">Suggestions</h2>
      <p className="health-summary">
        {actionable.length} of {data.suggestions.length} games have something to look at.
      </p>

      {data.suggestions.length === 0 ? (
        <p className="health-empty">The sweep has written nothing for the router to read yet.</p>
      ) : (
        <div className="health-table-scroll">
          <table className="health-table">
            <thead>
              <tr>
                <th>Game</th>
                <th>Class</th>
                <th>Priority</th>
                <th>Evidence</th>
                <th>From players</th>
              </tr>
            </thead>
            <tbody>
              {data.suggestions.map((suggestion) => (
                <SuggestionRow key={suggestion.slug} suggestion={suggestion} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="health-note">
        Computed on read and stored nowhere. Only as current as the nightly scorecard sweep behind it
        {data.computedFrom ? ` (last computed ${data.computedFrom})` : ' (which has never run)'}. Nothing here has been
        filed against any game.
      </p>
    </section>
  );
}

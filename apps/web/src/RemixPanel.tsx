import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';
import { recordRemixStep } from './visitTelemetry.js';
import {
  coerceSharedParams,
  remixAssist,
  remixCode,
  remixShare,
  startRemix,
  type RemixApiError,
  type RemixSession,
} from './remixApi.js';
import type { EditorLabel, EditorParamValue } from './studioApi.js';

/**
 * Remix: a player bends a published game while playing it.
 *
 * Three speeds, deliberately visible as three different things:
 *
 *  - **A slider** moves the running game over the `editor:content` bridge with
 *    no round trip. Under a frame, no rebuild, and the fallback whenever the
 *    words lane misreads.
 *  - **A sentence** goes to the tuning router and comes back as values, which
 *    are then applied exactly as if the slider had moved. Applied immediately
 *    with one tap back — a confirm step would kill the whole feel.
 *  - **A sentence that needs code** goes to the code lane, which returns a whole
 *    rebuilt document. That one cannot be applied to a running game (the frame
 *    has no eval and no network by design), so it rides the pause seam below.
 *
 * The pause seam, and why it is a seam rather than a stall: the game is paused
 * *before* the request goes out, so the change can never land mid-jump — the
 * whole class of dropped-input and half-applied-physics bugs is designed out
 * rather than debugged later. The freeze is covered by a working state that
 * reads as deliberate, and the run restarts on the new build, which is said out
 * loud rather than hidden (most published games cannot yet serialize their
 * state — ops repo §D.8.1).
 */

type Lane = 'idle' | 'asking' | 'building';

type Note = { kind: 'ok' | 'info' | 'error'; text: string } | null;

export function RemixPanel(props: {
  slug: string;
  frameRef: MutableRefObject<HTMLIFrameElement | null>;
  /** Swap the running document — the parent owns the frame's html. */
  onSwapDocument: (html: string) => void;
  onClose: () => void;
  /** Shared values from a `?remix=` link, already parsed. */
  initialParams?: Record<string, EditorParamValue> | null;
}) {
  const { t, i18n } = useTranslation();
  const [session, setSession] = useState<RemixSession | null>(null);
  const [values, setValues] = useState<Record<string, EditorParamValue>>({});
  const [utterance, setUtterance] = useState('');
  const [lane, setLane] = useState<Lane>('idle');
  const [note, setNote] = useState<Note>(null);
  const [undo, setUndo] = useState<Record<string, EditorParamValue> | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const label = useCallback(
    (both: EditorLabel | undefined) => (both ? (i18n.language?.startsWith('pl') ? both.pl : both.en) : ''),
    [i18n.language],
  );

  /** Push the whole params document into the running game. */
  const pushToGame = useCallback(
    (next: Record<string, EditorParamValue>) => {
      props.frameRef.current?.contentWindow?.postMessage(
        { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t: 'editor:content', content: { params: next } },
        '*',
      );
    },
    [props.frameRef],
  );

  useEffect(() => {
    let cancelled = false;
    startRemix(props.slug)
      .then((started) => {
        if (cancelled) return;
        recordRemixStep('opened');
        setSession(started);
        const base = started.values ?? {};
        const merged =
          props.initialParams && started.params
            ? coerceSharedParams(started.params, { ...base, ...props.initialParams })
            : base;
        setValues(merged);
        // A shared link's values are live the moment the game is listening.
        if (props.initialParams) window.setTimeout(() => pushToGame(merged), 300);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [props.slug, props.initialParams, pushToGame]);

  function setParam(key: string, value: EditorParamValue) {
    const next = { ...valuesRef.current, [key]: value };
    setValues(next);
    pushToGame(next);
    recordRemixStep('tuned');
  }

  async function ask() {
    const text = utterance.trim();
    if (!session || text.length < 2 || lane !== 'idle') return;
    setNote(null);
    recordRemixStep('asked');

    // The tuning lane first: it is cheaper, faster, and covers most of what
    // people ask for. Only what it declines is worth a rebuild.
    if (session.canAssist) {
      setLane('asking');
      try {
        const result = await remixAssist(session.remixId, text, valuesRef.current);
        if (result.lane === 'params' && result.values) {
          const before = valuesRef.current;
          const next = result.values;
          setValues(next);
          pushToGame(next);
          setUndo(before);
          setUtterance('');
          setLane('idle');
          recordRemixStep('applied');
          setNote({ kind: 'ok', text: label(result.summary) || t('remix.applied') });
          return;
        }
        if (result.lane === 'reject') {
          setLane('idle');
          recordRemixStep('refused');
          setNote({ kind: 'error', text: label(result.summary) || t('remix.refused') });
          return;
        }
        // `code` or `content`: falls through to the code lane below.
        if (!session.canCode) {
          setLane('idle');
          recordRemixStep('handoff');
          setNote({ kind: 'info', text: label(result.summary) || t('remix.needsCode') });
          return;
        }
      } catch (error) {
        setLane('idle');
        const status = (error as RemixApiError).status;
        setNote({ kind: 'error', text: status === 429 ? t('remix.quota') : t('remix.unavailable') });
        return;
      }
    }

    if (!session.canCode) {
      recordRemixStep('handoff');
      setNote({ kind: 'info', text: t('remix.needsCode') });
      return;
    }

    // The pause seam. Freeze first, so nothing can land mid-jump.
    setLane('building');
    props.frameRef.current?.contentWindow?.postMessage({ source: 'gdpl-host', type: 'pause' }, '*');
    try {
      const result = await remixCode(session.remixId, text);
      if (result.ok) {
        recordRemixStep('applied');
        setUtterance('');
        setNote({ kind: 'ok', text: `${label(result.summary) || t('remix.rebuilt')} ${t('remix.restarted')}` });
        // The swap replaces the whole document, so the new build boots fresh and
        // the values the player has set are re-sent once it says hello.
        props.onSwapDocument(result.html);
        window.setTimeout(() => pushToGame(valuesRef.current), 400);
      } else {
        recordRemixStep(result.reason === 'refused' ? 'refused' : 'handoff');
        props.frameRef.current?.contentWindow?.postMessage({ source: 'gdpl-host', type: 'resume' }, '*');
        setNote({
          kind: result.reason === 'refused' ? 'error' : 'info',
          text:
            label(result.summary) ||
            (result.reason === 'did_not_compile' ? t('remix.couldNotBuild') : t('remix.tooBig')),
        });
      }
    } catch (error) {
      props.frameRef.current?.contentWindow?.postMessage({ source: 'gdpl-host', type: 'resume' }, '*');
      const status = (error as RemixApiError).status;
      setNote({ kind: 'error', text: status === 429 ? t('remix.quota') : t('remix.unavailable') });
    } finally {
      setLane('idle');
    }
  }

  function undoLast() {
    if (!undo) return;
    setValues(undo);
    pushToGame(undo);
    setUndo(null);
    setNote(null);
  }

  async function share() {
    if (!session) return;
    try {
      const result = await remixShare(session.remixId, valuesRef.current);
      const url = `${window.location.origin}/play/${result.slug}?remix=${result.code}`;
      setShareUrl(url);
      recordRemixStep('shared');
      await navigator.clipboard?.writeText(url).catch(() => {});
      setNote({
        kind: 'ok',
        text: result.codeEditsExcluded ? t('remix.sharedWithoutCode') : t('remix.shared'),
      });
    } catch {
      setNote({ kind: 'error', text: t('remix.shareFailed') });
    }
  }

  if (failed) {
    return (
      <div className="remix-panel remix-panel-note" role="alert">
        {t('remix.unavailable')}
        <button type="button" className="secondary-btn" onClick={props.onClose}>
          {t('remix.close')}
        </button>
      </div>
    );
  }
  if (!session) return <div className="remix-panel remix-panel-note">{t('remix.starting')}</div>;

  const specs = session.params;
  const canType = session.canAssist || session.canCode;

  return (
    <div className="remix-panel">
      {/*
       * The working state covers the frozen frame rather than replacing it: the
       * game stays visible behind the shimmer, so the beat reads as the change
       * being made and not as the game having gone away.
       */}
      {lane === 'building' ? (
        <div className="remix-working" role="status">
          <span className="remix-shimmer" aria-hidden="true" />
          {t('remix.building')}
        </div>
      ) : null}

      <div className="remix-head">
        <strong>{t('remix.title')}</strong>
        <button type="button" className="remix-close" onClick={props.onClose} aria-label={t('remix.close')}>
          ×
        </button>
      </div>

      {canType ? (
        <form
          className="remix-ask"
          onSubmit={(event) => {
            event.preventDefault();
            void ask();
          }}
        >
          <input
            type="text"
            maxLength={240}
            value={utterance}
            placeholder={t('remix.placeholder')}
            aria-label={t('remix.inputLabel')}
            onChange={(event) => setUtterance(event.target.value)}
          />
          <button type="submit" disabled={lane !== 'idle' || utterance.trim().length < 2}>
            {lane === 'idle' ? t('remix.ask') : t('remix.asking')}
          </button>
        </form>
      ) : null}

      {note ? (
        <p className={`remix-note is-${note.kind}`} role="status">
          {note.text}
          {undo ? (
            <button type="button" className="remix-undo" onClick={undoLast}>
              {t('remix.undo')}
            </button>
          ) : null}
        </p>
      ) : null}

      {specs ? (
        <div className="remix-sliders">
          {Object.entries(specs).map(([key, spec]) => {
            const value = values[key] ?? spec.default;
            if (spec.type === 'int' || spec.type === 'number') {
              const shown = typeof value === 'number' ? value : spec.min;
              return (
                <label key={key} className="remix-row">
                  <span>
                    {label(spec.label)} <em>{Math.round(shown * 100) / 100}</em>
                  </span>
                  <input
                    type="range"
                    min={spec.min}
                    max={spec.max}
                    step={spec.type === 'int' ? 1 : (spec.max - spec.min) / 100}
                    value={shown}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      if (Number.isFinite(parsed)) setParam(key, spec.type === 'int' ? Math.round(parsed) : parsed);
                    }}
                  />
                </label>
              );
            }
            if (spec.type === 'bool') {
              return (
                <label key={key} className="remix-row is-toggle">
                  <span>{label(spec.label)}</span>
                  <input
                    type="checkbox"
                    checked={value === true}
                    onChange={(event) => setParam(key, event.target.checked)}
                  />
                </label>
              );
            }
            if (spec.type === 'enum') {
              return (
                <label key={key} className="remix-row">
                  <span>{label(spec.label)}</span>
                  <select
                    value={typeof value === 'string' ? value : spec.values[0]}
                    onChange={(event) => setParam(key, event.target.value)}
                  >
                    {spec.values.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              );
            }
            return (
              <label key={key} className="remix-row">
                <span>{label(spec.label)}</span>
                <input
                  type="text"
                  maxLength={spec.max}
                  value={typeof value === 'string' ? value : ''}
                  onChange={(event) => setParam(key, event.target.value)}
                />
              </label>
            );
          })}
        </div>
      ) : (
        <p className="remix-panel-note">{t('remix.nothingTunable')}</p>
      )}

      {/*
       * The two upgrade triggers, side by side and never a wall. "Make it yours"
       * hands the remix to the ordinary creation flow as a prefilled concept —
       * the honest version of keeping it, since a remix itself never publishes.
       */}
      <div className="remix-actions">
        {specs ? (
          <button type="button" className="remix-action" onClick={() => void share()}>
            {t('remix.share')}
          </button>
        ) : null}
        <a
          className="remix-action is-primary"
          href={`/?concept=${encodeURIComponent(t('remix.conceptSeed', { slug: props.slug }))}`}
          onClick={() => recordRemixStep('keep_clicked')}
        >
          {t('remix.makeItYours')}
        </a>
      </div>
      {shareUrl ? <p className="remix-share-url">{shareUrl}</p> : null}
    </div>
  );
}

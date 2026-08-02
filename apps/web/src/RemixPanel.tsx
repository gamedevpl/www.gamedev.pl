import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';
import { recordRemixStep } from './visitTelemetry.js';
import { useAuth } from './AuthContext.js';
import { AuthModal } from './AuthModal.js';
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
 * **Prompt-only** (owner decision, post-build session): the player sees ONE
 * door — say what you want, it happens. Which lane satisfies the request
 * (values or a rebuild) is an implementation detail the messaging never names.
 * The sliders survive behind an expert mode (`?remixExpert=1`) for power users
 * and for the owner when a request misfires — valves behind a panel, not the
 * faucet.
 *
 * **The wall comes after the words.** A signed-out visitor can open the panel
 * and type; sign-in drops at send, right before anything is spent, and the
 * typed request is carried across login so it runs the second they're through.
 * The stash lives in sessionStorage under this tab only and is cleared on use —
 * it is player content (the same privacy class as an utterance) and never
 * enters telemetry; the funnel records only that the wall was hit and crossed.
 *
 * Three speeds underneath, deliberately distinct in mechanism:
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

/** Tab-scoped stash for the request typed before the wall. Cleared on use. */
const PENDING_KEY = 'gdpl-remix-pending';

/**
 * The stash, guarded and scoped.
 *
 * Guarded because `sessionStorage` *throws* in Safari private mode and hardened
 * configurations — and the throw landed inside the send handler, so the wall
 * never opened and the tap did nothing at all. The in-memory fallback keeps the
 * whole flow working where storage is unavailable; it only loses the words if
 * the tab reloads during sign-in, which is the lesser failure by a mile.
 *
 * Scoped because the key is tab-global: type on game A, dismiss the wall, sign
 * in later, open Remix on game B, and B would silently run A's request — a
 * spend on a game nobody asked about. The slug travels with the text and a
 * mismatch clears the stash rather than firing it.
 */
let memoryPending: string | null = null;

function stashPending(slug: string, text: string): void {
  const payload = JSON.stringify({ slug, text });
  memoryPending = payload;
  try {
    window.sessionStorage.setItem(PENDING_KEY, payload);
  } catch {
    // Storage refused; the in-memory copy is the fallback.
  }
}

/** Returns the pending text when it belongs to `slug`, clearing it either way. */
function takePending(slug: string): string | null {
  let raw = memoryPending;
  if (raw === null) {
    try {
      raw = window.sessionStorage.getItem(PENDING_KEY);
    } catch {
      raw = null;
    }
  }
  if (raw === null) return null;
  const clear = () => {
    memoryPending = null;
    try {
      window.sessionStorage.removeItem(PENDING_KEY);
    } catch {
      // Nothing to do — the in-memory copy is already gone.
    }
  };
  try {
    const parsed = JSON.parse(raw) as { slug?: string; text?: string };
    if (typeof parsed.text !== 'string' || parsed.slug !== slug) {
      // Another game's words. Dropped rather than replayed here.
      clear();
      return null;
    }
    clear();
    return parsed.text;
  } catch {
    clear();
    return null;
  }
}

type Lane = 'idle' | 'asking' | 'building';

/** After this long the shimmer needs words, or it reads as broken. */
const SLOW_AFTER_MS = 8_000;
/**
 * The hard ceiling on a rebuild round trip. Generous on purpose: a legitimate
 * code-lane run with repair rounds can take half a minute, and aborting a call
 * that was about to land is worse than a long beat with honest copy. Past this,
 * the player gets their game back untouched.
 */
const CODE_TIMEOUT_MS = 45_000;

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
  const { user } = useAuth();
  const [session, setSession] = useState<RemixSession | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  /** Sliders and share stay tucked away unless explicitly asked for. */
  const expert = useMemo(() => new URLSearchParams(window.location.search).has('remixExpert'), []);
  const [values, setValues] = useState<Record<string, EditorParamValue>>({});
  const [utterance, setUtterance] = useState('');
  const [lane, setLane] = useState<Lane>('idle');
  const [note, setNote] = useState<Note>(null);
  const [slow, setSlow] = useState(false);
  /** Consecutive model-lane failures — two in a row reads as "editing is napping". */
  const failStreakRef = useRef(0);
  const [undo, setUndo] = useState<Record<string, EditorParamValue> | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState<'unsupported' | 'error' | null>(null);
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

  // The panel is open the moment it renders, signed in or not. Recorded here
  // rather than on a minted session: a signed-out visitor can reach `typed` and
  // `wall_shown`, and counting those against a denominator that only signed-in
  // opens increment would make every rung read as a share of the wrong total —
  // exactly the wall experiment this funnel exists to measure.
  useEffect(() => {
    recordRemixStep('opened');
  }, []);

  // Identity, not the object: this effect mints a session and the only thing
  // about the viewer it depends on is which account they are. Keying on the
  // object would re-run — and re-mint — on any render that hands back a fresh
  // one, and a game that declares no values makes that loop self-sustaining.
  const uid = user?.uid ?? null;
  useEffect(() => {
    // No session without a session: the API 401s signed out, and the composer
    // needs nothing from the server until send — so a visitor can type first.
    if (!uid) return;
    let cancelled = false;
    startRemix(props.slug)
      .then((started) => {
        if (cancelled) return;
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
      .catch((error: RemixApiError) => {
        // 404 is a fact about this game (not remixable here), not a fault —
        // the panel says the honest thing instead of "couldn't do that".
        if (!cancelled) setFailed(error.status === 404 ? 'unsupported' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [props.slug, props.initialParams, pushToGame, uid]);

  // The reward lands the second they're through the wall: once the session
  // exists and a stashed request is waiting, run it with no further taps.
  const ranPendingRef = useRef(false);
  useEffect(() => {
    if (!session || ranPendingRef.current) return;
    const pending = takePending(props.slug);
    if (pending === null) return;
    ranPendingRef.current = true;
    recordRemixStep('signed_in');
    setUtterance(pending);
    void ask(pending, session);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per session arrival
  }, [session, props.slug]);

  function setParam(key: string, value: EditorParamValue) {
    const next = { ...valuesRef.current, [key]: value };
    setValues(next);
    pushToGame(next);
    recordRemixStep('tuned');
  }

  async function ask(textOverride?: string, sessionOverride?: RemixSession) {
    const active = sessionOverride ?? session;
    const text = (textOverride ?? utterance).trim();
    if (text.length < 2 || lane !== 'idle') return;
    // Desire exists the moment they hit send, wall or no wall.
    recordRemixStep('typed');
    if (!user) {
      // The wall, exactly one step before anything is spent. The words survive
      // the trip: stashed for this tab only, cleared the moment they run.
      recordRemixStep('wall_shown');
      stashPending(props.slug, text);
      setAuthOpen(true);
      return;
    }
    if (!active) return; // session still starting — the send lands a beat later
    setNote(null);
    recordRemixStep('asked');

    // The tuning lane first: it is cheaper, faster, and covers most of what
    // people ask for. Only what it declines is worth a rebuild.
    if (active.canAssist) {
      setLane('asking');
      try {
        const result = await remixAssist(active.remixId, text, valuesRef.current);
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
        if (!active.canCode) {
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

    if (!active.canCode) {
      recordRemixStep('handoff');
      setNote({ kind: 'info', text: t('remix.needsCode') });
      return;
    }

    // The pause seam. Freeze first, so nothing can land mid-jump.
    setLane('building');
    setSlow(false);
    props.frameRef.current?.contentWindow?.postMessage({ source: 'gdpl-host', type: 'pause' }, '*');
    const controller = new AbortController();
    const slowTimer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    const hardTimer = window.setTimeout(() => controller.abort(), CODE_TIMEOUT_MS);
    try {
      const result = await remixCode(active.remixId, text, controller.signal);
      if (result.ok) {
        failStreakRef.current = 0;
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
      // Whatever went wrong — timeout, network, 5xx — the old document simply
      // resumes; the player never pays for our slow afternoon with their run.
      props.frameRef.current?.contentWindow?.postMessage({ source: 'gdpl-host', type: 'resume' }, '*');
      failStreakRef.current += 1;
      const status = (error as RemixApiError).status;
      const timedOut = controller.signal.aborted;
      setNote({
        kind: timedOut ? 'info' : 'error',
        text: timedOut
          ? t('remix.tookTooLong')
          : status === 429
            ? t('remix.quota')
            : failStreakRef.current >= 2
              ? t('remix.napping')
              : t('remix.unavailable'),
      });
    } finally {
      window.clearTimeout(slowTimer);
      window.clearTimeout(hardTimer);
      setSlow(false);
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
        {failed === 'unsupported' ? t('remix.notHere') : t('remix.unavailable')}
        <button type="button" className="secondary-btn" onClick={props.onClose}>
          {t('remix.close')}
        </button>
      </div>
    );
  }
  // Signed in but the session is still being minted → a short starting state.
  // Signed out there is nothing to wait for: the composer is the whole surface.
  if (user && !session) return <div className="remix-panel remix-panel-note">{t('remix.starting')}</div>;

  const specs = session?.params ?? null;
  // The composer is the door. Signed out we cannot know the lanes yet, and the
  // honest answer is to accept the words and let the wall decide — so it types.
  const canType = session ? session.canAssist || session.canCode : true;

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
          {slow ? t('remix.buildingSlow') : t('remix.building')}
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
      ) : (
        /*
         * No lane answers here — the game declares no parameters and its code is
         * not reachable for a rebuild. The panel has to say so: a surface whose
         * whole promise is "say what you want" cannot open with no place to say
         * it and no explanation, which reads as broken rather than as not-yet.
         * The way onward stays offered below.
         */
        <p className="remix-note is-info" role="status">
          {t('remix.notHere')}
        </p>
      )}

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

      {expert && specs ? (
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
      ) : null}

      {/*
       * The two upgrade triggers, side by side and never a wall. "Make it yours"
       * hands the remix to the ordinary creation flow as a prefilled concept —
       * the honest version of keeping it, since a remix itself never publishes.
       */}
      <div className="remix-actions">
        {expert && specs ? (
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
      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        title={t('remix.signInTitle')}
        subtitle={t('remix.wallSubtitle')}
      />
    </div>
  );
}

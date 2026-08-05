import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon.js';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';
import { recordRemixStep } from './visitTelemetry.js';
import { useAuth } from './AuthContext.js';
import { AuthModal } from './AuthModal.js';
import {
  coerceSharedParams,
  remixAssist,
  remixCode,
  remixSave,
  remixShare,
  remixUndo,
  startRemix,
  type RemixApiError,
  type RemixSession,
  type RemixSuggestion,
} from './remixApi.js';
import { RemixPainter } from './RemixPainter.js';
import type {
  EditorContentDoc,
  EditorItemContent,
  EditorLabel,
  EditorParamSpec,
  EditorParamValue,
} from './studioApi.js';
import type { RemixPaintedVia } from './visitTelemetry.js';
import { NAVIGATE_EVENT, studioPath } from './router.js';

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

/**
 * Would a link carry anything?
 *
 * Only declared values travel — generated code never does, which is the whole
 * point of the gate — and the link is a *diff*: a value sitting at its default
 * says nothing a plain link to the game does not already say. So a change that
 * lived entirely in code leaves nothing to share, and offering Share anyway
 * hands the player a link to the game they started with. The loudest button on
 * the panel must not be the one that produces the least true thing on it.
 */
function hasShareableValues(
  specs: Record<string, EditorParamSpec> | null | undefined,
  values: Record<string, EditorParamValue>,
): boolean {
  if (!specs) return false;
  return Object.entries(specs).some(([key, spec]) => key in values && values[key] !== spec.default);
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
/** Matches the server's own ceiling on an utterance. */
const MAX_UTTERANCE = 240;
/** Three lines, then it scrolls. Past that a request is a paragraph, not a request. */
const MAX_INPUT_HEIGHT = 84;
/**
 * How long to listen for the swapped document throwing.
 *
 * The code lane verifies that a rebuild *assembles*, which is not the same as
 * verifying that it runs: the first real remix produced valid TypeScript whose
 * `createRound` threw on `undefined.map`, and the player was left with a broken
 * game, a cheerful tick and no way back. The frame already reports its uncaught
 * errors to the host — the same channel play telemetry uses — so the panel can
 * hear that rather than making the player be the detector.
 */
const SWAP_WATCH_MS = 6_000;

type Note = { kind: 'ok' | 'info' | 'error'; text: string } | null;

/** Theater takeover while the level painter is open — parent restyles the iframe slot. */
export type RemixEditorStage = {
  active: boolean;
  focus: 'edit' | 'play';
};

export function RemixPanel(props: {
  slug: string;
  frameRef: MutableRefObject<HTMLIFrameElement | null>;
  /** Swap the running document — the parent owns the frame's html. */
  onSwapDocument: (html: string) => void;
  onClose: () => void;
  /** Shared values from a `?remix=` link, already parsed. */
  initialParams?: Record<string, EditorParamValue> | null;
  /**
   * The session, owned by the parent so it outlives this sheet.
   *
   * Closing the panel does not end a remix — the changed document keeps running
   * — so minting a session per mount stranded the player: reopen after a
   * play-test and the history that held their way back was gone.
   */
  session?: RemixSession | null;
  onSession?: (session: RemixSession) => void;
  /** Whether the server still has a step to give back. */
  undoable?: boolean;
  onUndoable?: (undoable: boolean) => void;
  /**
   * The More-menu door to the painter: bumped by the theater when "Level
   * editor" is chosen. A nonce rather than a boolean so choosing it again
   * reopens a painter the player closed.
   */
  painterRequest?: number;
  /** Tells the theater whether this game has a painter to put in its menu. */
  onCapabilities?: (caps: { painter: boolean }) => void;
  /**
   * Reports editor-stage focus so the host can PiP the live game without
   * unmounting it. Cleared when the painter closes (back to the remix sheet).
   */
  onEditorStage?: (stage: RemixEditorStage) => void;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [ownSession, setOwnSession] = useState<RemixSession | null>(props.session ?? null);
  const session = props.session ?? ownSession;
  const setSession = useCallback(
    (next: RemixSession) => {
      setOwnSession(next);
      props.onSession?.(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the callback prop is stable in practice
    [],
  );
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
  const [saving, setSaving] = useState(false);
  /** The last change that landed, and whether there is anything to share of it. */
  const [changed, setChanged] = useState<{
    text: string;
    canShare: boolean;
    undoCode?: boolean;
    broke?: boolean;
  } | null>(null);
  /** The player's own words, echoed back while the rebuild runs. */
  const [asked, setAsked] = useState('');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [failed, setFailed] = useState<'unsupported' | 'error' | null>(null);
  const valuesRef = useRef(values);
  valuesRef.current = values;
  /**
   * The painter's document — the game's declared collections, seeded from the
   * declaration's defaults. Client-only: painted content reaches the game over
   * the bridge and never travels to the server (decision 3.2 in the ops plan —
   * remixes stay ephemeral; the session is the only home this has).
   */
  const [contentDoc, setContentDoc] = useState<EditorContentDoc>({});
  const contentDocRef = useRef(contentDoc);
  contentDocRef.current = contentDoc;
  const [painterOpen, setPainterOpen] = useState(false);
  /** After the stage has opened once, Done leaves a door back on the sheet. */
  const [painterSeen, setPainterSeen] = useState(false);
  /**
   * Edit = map full-bleed + game PiP; Play = game full-bleed + map PiP.
   * Both surfaces stay mounted — only focus (and host CSS) flips.
   */
  const [editorFocus, setEditorFocus] = useState<'edit' | 'play'>('edit');
  /**
   * Whether the suggestions accept a press yet.
   *
   * They sit directly under the composer, they arrive with the session rather
   * than with the panel, and the gesture that opened the panel is still landing
   * when they appear — so a tap meant for the sheet could hit one, and a
   * suggestion used to *send*. That is twenty seconds of rebuild and an undo for
   * a press nobody made. Arming late costs a moment; not arming late costs a
   * game edit.
   */
  const [suggestionsArmed, setSuggestionsArmed] = useState(false);
  /** Whether the router proposed the painter and the offer is still on screen. */
  const [painterOffer, setPainterOffer] = useState(false);
  /** First door wins — matches the telemetry dedupe, which keeps the first via. */
  const painterDoorRef = useRef<RemixPaintedVia | null>(null);
  const contentEditedRef = useRef(false);
  const contentPushTimer = useRef<number | null>(null);

  const label = useCallback(
    (both: EditorLabel | undefined) => (both ? (i18n.language?.startsWith('pl') ? both.pl : both.en) : ''),
    [i18n.language],
  );

  /**
   * Push the whole content document into the running game.
   *
   * Whole, not partial, because the game-side module *replaces* its content
   * with what arrives — it never merges with the build-inlined defaults. A
   * params-only push to a game that also declares collections used to hand it
   * a document with no maps, and the game's next restart read them off a
   * content object that no longer had any.
   */
  const pushToGame = useCallback(
    (next: Record<string, EditorParamValue>, contentOverride?: EditorContentDoc) => {
      const collections = contentOverride ?? contentDocRef.current;
      props.frameRef.current?.contentWindow?.postMessage(
        { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, t: 'editor:content', content: { ...collections, params: next } },
        '*',
      );
    },
    [props.frameRef],
  );

  /**
   * A painting burst is many cell taps in a second, and the pilot game restarts
   * its round on every content change it sees — so painted content lands on a
   * short debounce while a slider stays instant. Half a second is long enough
   * to absorb a stroke and short enough that "paint, look up, play" never waits.
   */
  const pushContentSoon = useCallback(
    (next: EditorContentDoc) => {
      if (contentPushTimer.current !== null) window.clearTimeout(contentPushTimer.current);
      contentPushTimer.current = window.setTimeout(() => {
        contentPushTimer.current = null;
        pushToGame(valuesRef.current, next);
      }, 500);
    },
    [pushToGame],
  );

  // Flush, not just cancel: the frame outlives the sheet, and a player who
  // paints and immediately closes the panel is exactly the player who wants to
  // go play what they painted — cancelling the only scheduled push would lose
  // their last stroke with the panel state that held it.
  useEffect(
    () => () => {
      if (contentPushTimer.current !== null) {
        window.clearTimeout(contentPushTimer.current);
        contentPushTimer.current = null;
        pushToGame(valuesRef.current);
      }
    },
    [pushToGame],
  );

  // The panel is open the moment it renders, signed in or not. Recorded here
  // rather than on a minted session: a signed-out visitor can reach `typed` and
  // `wall_shown`, and counting those against a denominator that only signed-in
  // opens increment would make every rung read as a share of the wrong total —
  // exactly the wall experiment this funnel exists to measure.
  useEffect(() => {
    // A door records this too, with which door it was, and the step dedupes — so
    // a click keeps its `entry` and this only lands for the path that has none:
    // a shared link that opens the panel on arrival.
    recordRemixStep('opened');
  }, []);

  const suggestions = session?.suggestions ?? [];
  const showSuggestions = lane === 'idle' && !changed && utterance.length === 0 && suggestions.length > 0;

  /*
   * The delay runs from when the suggestions *appear*, not from when the panel
   * mounts.
   *
   * They arrive with the session, which is a network round trip — reliably
   * longer than 400ms. A mount-time timer therefore expired while the panel was
   * still showing its starting state, and armed them on the very first frame
   * they rendered: exactly the frame whose layout change lands under a finger
   * already moving. The guard was inert precisely when it was needed.
   *
   * Re-arming on every appearance rather than once is deliberate. They come
   * back when the field empties or a change lands, and both are moments the
   * panel just reflowed.
   */
  useEffect(() => {
    if (!showSuggestions) {
      setSuggestionsArmed(false);
      return;
    }
    const timer = window.setTimeout(() => setSuggestionsArmed(true), 400);
    return () => window.clearTimeout(timer);
  }, [showSuggestions]);

  // Identity, not the object: this effect mints a session and the only thing
  // about the viewer it depends on is which account they are. Keying on the
  // object would re-run — and re-mint — on any render that hands back a fresh
  // one, and a game that declares no values makes that loop self-sustaining.
  // `onCapabilities` sits in the deps for lint's sake, so the parent MUST hand
  // down a stable callback — an inline arrow here re-mints the session per render.
  const uid = user?.uid ?? null;
  const onCapabilities = props.onCapabilities;
  useEffect(() => {
    // No session without a session: the API 401s signed out, and the composer
    // needs nothing from the server until send — so a visitor can type first.
    if (!uid) return;
    // Already have one from a previous opening of this sheet — reusing it is the
    // whole point: its history is the player's way back.
    if (props.session) return;
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
        // The painter's starting point is the declaration's own defaults. Set on
        // the ref synchronously as well, so a push scheduled in this same tick
        // (the shared-link one below) already carries the maps.
        const contentDefaults: EditorContentDoc = started.content
          ? Object.fromEntries(Object.entries(started.content).map(([key, spec]) => [key, spec.defaults]))
          : {};
        contentDocRef.current = contentDefaults;
        setContentDoc(contentDefaults);
        onCapabilities?.({ painter: Boolean(started.content) });
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
  }, [props.slug, props.initialParams, props.session, setSession, pushToGame, uid, onCapabilities]);

  /** Open the painter, remembering which door was first — telemetry keeps that one. */
  const openPainter = useCallback((door: RemixPaintedVia) => {
    if (painterDoorRef.current === null) painterDoorRef.current = door;
    setPainterOffer(false);
    setPainterSeen(true);
    setEditorFocus('edit');
    setPainterOpen(true);
  }, []);

  const painterStageActive = Boolean(painterOpen && session?.content && lane !== 'building');

  // Host restyles the iframe slot from this signal — never remount the frame.
  // Cleanup must NOT run on focus flips (that would flash the stage off); only
  // report `active: false` when the painter closes or this panel unmounts.
  useEffect(() => {
    props.onEditorStage?.({ active: painterStageActive, focus: editorFocus });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- notify on stage/focus only
  }, [painterStageActive, editorFocus]);
  useEffect(() => {
    return () => props.onEditorStage?.({ active: false, focus: 'edit' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount only
  }, []);

  // The More-menu door. A nonce: the same entry chosen again reopens a painter
  // the player closed, which a boolean prop cannot express.
  const painterRequest = props.painterRequest ?? 0;
  useEffect(() => {
    if (painterRequest > 0) openPainter('menu');
  }, [painterRequest, openPainter]);

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

  // The field grows to the sentence rather than scrolling it out of sight: a
  // one-line box teaches people to write search terms, and search terms are the
  // requests the router reads worst.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [utterance, changed]);

  // Reopened over a change that is still running: the way back is the first
  // thing this sheet owes the player, before they ask for anything else.
  useEffect(() => {
    if (props.undoable && !changed) {
      setChanged({ text: t('remix.changeStanding'), canShare: false, undoCode: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on arrival
  }, [props.undoable]);

  // A panel that opened onto nothing. Recorded against the same `opened`
  // denominator so the share of visits that met a game with no way in is a
  // number rather than an anecdote — it is the difference between "people are
  // not interested" and "we showed them a door that does not open". A painter
  // is a way in, so a collections game never counts here — and while the model
  // flags are off it is the *only* lane, so the panel opens straight onto it
  // rather than onto a composer that cannot answer.
  useEffect(() => {
    if (!session || session.canAssist || session.canCode) return;
    if (session.content) {
      openPainter('panel');
      return;
    }
    recordRemixStep('no_lane');
  }, [session, openPainter]);

  /**
   * A suggestion, written out in the player's language.
   *
   * Composed here rather than on the server because this is the one line a
   * player is about to imitate, and it has to be in the language they are about
   * to imitate it in — a Polish panel offering an English example teaches the
   * wrong thing twice.
   */
  function suggestionText(suggestion: RemixSuggestion): string {
    if (suggestion.kind === 'starter') return t(`remix.try.${suggestion.id}`);
    const spec = session?.params?.[suggestion.key];
    if (!spec) return '';
    const name = label(spec.label);
    if (!name) return '';
    let direction = suggestion.direction;
    if (spec.type === 'bool') {
      // Against what the game is doing *now*, which only the client knows: a
      // shared link can arrive with a toggle already flipped, and the server
      // derived its direction from the declaration's default. Offering "turn on"
      // for something already on is a suggestion that does nothing — and it does
      // it expensively, since a no-op patch falls through to a rebuild.
      const live = values[suggestion.key];
      const isOn = typeof live === 'boolean' ? live : spec.default === true;
      direction = isOn ? 'off' : 'on';
    }
    return t(`remix.try.${direction}`, { label: name });
  }

  function setParam(key: string, value: EditorParamValue) {
    const next = { ...valuesRef.current, [key]: value };
    setValues(next);
    pushToGame(next);
    recordRemixStep('tuned');
    setChanged({
      text: t('remix.changeStanding'),
      canShare: hasShareableValues(session?.params ?? null, next),
    });
  }

  /** The player painted — update the doc, tell the funnel, and land it after the stroke. */
  function paintContent(next: EditorContentDoc) {
    setContentDoc(next);
    contentDocRef.current = next;
    contentEditedRef.current = true;
    recordRemixStep('painted', { via: painterDoorRef.current ?? 'menu' });
    pushContentSoon(next);
    setChanged({
      text: t('remix.changeStanding'),
      // Painted maps do not travel in a share link today.
      canShare: hasShareableValues(session?.params ?? null, valuesRef.current),
    });
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
    // The previous result deliberately stays until a new one lands. Clearing it
    // here loses its Undo the moment a follow-up fails — and a follow-up that
    // fails is exactly when the player most wants the last good state back.
    setAsked(text);
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
          // Share is offered whenever there is anything shareable — a link
          // carries declared values, so a game with no declaration has nothing
          // to put in one, and offering it there would be a broken promise.
          setChanged({
            text: label(result.summary) || t('remix.applied'),
            canShare: hasShareableValues(active.params, next),
          });
          return;
        }
        if (result.lane === 'reject') {
          setLane('idle');
          recordRemixStep('refused');
          setNote({ kind: 'error', text: label(result.summary) || t('remix.refused') });
          return;
        }
        // A content-shaped request, and this game has a painter: the honest
        // answer is the brush, not a rebuild. The refusal this lane used to be
        // becomes a proposal (ops plan, decision 3.1) — the prompt stays the
        // one door, and the painter is where this conversation lands. No model
        // ever emits map cells; the router only classified.
        if (result.lane === 'content' && active.content) {
          setLane('idle');
          setPainterOffer(true);
          setNote({ kind: 'info', text: label(result.summary) || t('remix.editorOffer') });
          return;
        }
        // `code` (or `content` with nothing to paint): falls through to the code lane below.
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
        // A code change cannot travel in a link (the gate exists so generated
        // code never reaches a stranger), but the settings can — and the share
        // copy says exactly that rather than implying the whole remix went.
        setChanged({
          text: `${label(result.summary) || t('remix.rebuilt')} ${t('remix.restarted')}`,
          // A code change on its own carries nothing: the link is a diff of
          // declared values, and this one moved none of them.
          canShare: hasShareableValues(active.params, valuesRef.current),
          // A rebuild that compiles is not a rebuild that plays, and the lane
          // cannot tell the difference. One tap back is the safety net.
          undoCode: result.undoable !== false,
        });
        props.onUndoable?.(result.undoable !== false);
        setUndo(null);
        // The swap replaces the whole document, so the new build boots fresh and
        // the values the player has set are re-sent once it says hello.
        props.onSwapDocument(result.html);
        watchSwappedDocument();
        window.setTimeout(() => pushToGame(valuesRef.current), 400);
      } else {
        recordRemixStep(result.reason === 'refused' ? 'refused' : 'handoff');
        props.frameRef.current?.contentWindow?.postMessage({ source: 'gdpl-host', type: 'resume' }, '*');
        setNote({
          kind: result.reason === 'refused' ? 'error' : 'info',
          text:
            label(result.summary) ||
            // Each reason gets its own words. A refusal was reading as "too big",
            // which tells the player to try something smaller for a request that
            // size had nothing to do with.
            (result.reason === 'refused'
              ? t('remix.refused')
              : result.reason === 'did_not_compile'
                ? t('remix.couldNotBuild')
                : t('remix.tooBig')),
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

  /**
   * Put the game back the way it was before the last rebuild.
   *
   * The server owns this because the session is the base the next edit builds
   * on; undoing only the document in the browser would leave the broken source
   * in place and compound it on the following change.
   */
  async function undoCode() {
    const active = session;
    if (!active || lane !== 'idle') return;
    setLane('building');
    props.frameRef.current?.contentWindow?.postMessage({ source: 'gdpl-host', type: 'pause' }, '*');
    try {
      const result = await remixUndo(active.remixId);
      props.onSwapDocument(result.html);
      window.setTimeout(() => pushToGame(valuesRef.current), 400);
      recordRemixStep('undone');
      props.onUndoable?.(result.undoable);
      // More history behind it: the button stays, because the server can still
      // give another step back and the player has no other way to ask for it.
      setChanged(result.undoable ? { text: t('remix.changeStanding'), canShare: false, undoCode: true } : null);
      setNote({ kind: 'ok', text: t('remix.undone') });
    } catch {
      props.frameRef.current?.contentWindow?.postMessage({ source: 'gdpl-host', type: 'resume' }, '*');
      setNote({ kind: 'error', text: t('remix.undoFailed') });
    } finally {
      setLane('idle');
    }
  }

  /** Listen for the new build throwing, for a few seconds after the swap. */
  function watchSwappedDocument() {
    function onMessage(event: MessageEvent) {
      if (event.origin !== 'null') return;
      // Read the frame's window at delivery time: the swap replaced the document,
      // so the window captured before it is not the one now reporting.
      if (event.source !== props.frameRef.current?.contentWindow) return;
      const data = event.data as { source?: string; type?: string } | null;
      if (data?.source !== 'gdpl-player' || data.type !== 'error') return;
      stop();
      // `applied` was recorded when the rebuild arrived, a moment before the
      // game ran a frame. Without this the funnel counts a broken build as a
      // success and can never say whether the safety flow is working.
      recordRemixStep('broken');
      setChanged((current) => (current ? { ...current, broke: true, canShare: false } : current));
    }
    function stop() {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
    }
    const timer = window.setTimeout(stop, SWAP_WATCH_MS);
    window.addEventListener('message', onMessage);
  }

  function undoLast() {
    if (!undo) return;
    setValues(undo);
    pushToGame(undo);
    setUndo(null);
    setNote(null);
    setChanged(null);
  }

  async function share() {
    if (!session) return;
    try {
      const result = await remixShare(session.remixId, valuesRef.current);
      const url = `${window.location.origin}/play/${result.slug}?remix=${result.code}`;
      setShareUrl(url);
      recordRemixStep('shared');
      await navigator.clipboard?.writeText(url).catch(() => {});
      // A link carries declared values only. Painted maps stay behind for the
      // same reason code edits do — the share payload is schema-bounded params
      // until the age-rating question is answered (ops plan §4) — and leaving
      // that unsaid would promise a level the link does not deliver.
      setNote({
        kind: 'ok',
        text: result.codeEditsExcluded
          ? t('remix.sharedWithoutCode')
          : contentEditedRef.current
            ? t('remix.sharedWithoutContent')
            : t('remix.shared'),
      });
    } catch {
      setNote({ kind: 'error', text: t('remix.shareFailed') });
    }
  }

  /**
   * Keep the remixed sources as a private Studio draft under a new slug.
   *
   * Earned: only offered after a change has landed. Navigates to Studio on
   * success — the remix panel has nowhere left to point once the draft exists.
   */
  async function saveAsMine() {
    if (!session || saving) return;
    setSaving(true);
    setNote(null);
    try {
      const result = await remixSave(session.remixId, {
        params: valuesRef.current,
        ...(contentEditedRef.current ? { content: contentDocRef.current } : {}),
      });
      recordRemixStep('keep_clicked');
      const path = result.studioPath || studioPath(result.slug);
      window.history.pushState(null, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
      window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: { path } }));
      props.onClose();
    } catch (error) {
      const err = error as RemixApiError;
      const text =
        err.status === 429
          ? t('remix.saveQuota')
          : err.reason === 'no_sources'
            ? t('remix.saveNoSources')
            : err.reason === 'no_changes'
              ? t('remix.saveNoChanges')
              : t('remix.saveFailed');
      setNote({ kind: 'error', text });
    } finally {
      setSaving(false);
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

  /** The composer, in its two sizes: the door, and the way back for a second change. */
  function composer(compact: boolean) {
    return (
      <form
        className={`remix-ask${compact ? ' is-compact' : ''}`}
        onSubmit={(event) => {
          event.preventDefault();
          void ask();
        }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          maxLength={MAX_UTTERANCE}
          value={utterance}
          placeholder={compact ? t('remix.placeholderAgain') : t('remix.placeholder')}
          aria-label={t('remix.inputLabel')}
          onChange={(event) => setUtterance(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, as it does in every message box a phone has ever
            // shown; a newline in a one-sentence request is worth the shift key.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void ask();
            }
          }}
        />
        {utterance.length > 0 ? (
          <span className="remix-count" aria-hidden="true">
            {utterance.length}/{MAX_UTTERANCE}
          </span>
        ) : null}
        <button type="submit" className="remix-send" disabled={lane !== 'idle' || utterance.trim().length < 2}>
          {lane === 'idle' ? t('remix.ask') : t('remix.asking')}
        </button>
      </form>
    );
  }

  /*
   * Level editor owns the theater — not a widget inside the remix sheet.
   * Done returns to the sheet (Keep/Share stay earned there). Edit ↔ Play only
   * moves focus; the painter tree and the game iframe both stay mounted.
   */
  if (painterStageActive && session?.content) {
    const collectionKey = Object.keys(session.content)[0];
    const items = collectionKey ? ((contentDoc[collectionKey] as EditorItemContent[] | undefined) ?? []) : [];
    const levelName =
      typeof items[0]?.properties.name === 'string' && items[0].properties.name ? items[0].properties.name : null;

    return (
      <>
        <div className={`remix-editor-stage is-focus-${editorFocus}`}>
          <div className="remix-editor-chrome">
            <div className="remix-editor-identity">
              <span className="remix-editor-kicker">
                {editorFocus === 'edit' ? t('remix.editorEditing') : t('remix.editorPlaying')}
              </span>
              <span className="remix-editor-name">{levelName || t('remix.editorTitle')}</span>
            </div>
            <div className="remix-editor-chrome-actions">
              <div className="remix-editor-focus" role="group" aria-label={t('remix.editorFocusGroup')}>
                <button
                  type="button"
                  className={`remix-editor-focus-btn${editorFocus === 'edit' ? ' is-on' : ''}`}
                  aria-pressed={editorFocus === 'edit'}
                  onClick={() => setEditorFocus('edit')}
                >
                  {t('remix.editorFocusEdit')}
                </button>
                <button
                  type="button"
                  className={`remix-editor-focus-btn${editorFocus === 'play' ? ' is-on' : ''}`}
                  aria-pressed={editorFocus === 'play'}
                  onClick={() => setEditorFocus('play')}
                >
                  {t('remix.editorFocusPlay')}
                </button>
              </div>
              <button type="button" className="remix-editor-done" onClick={() => setPainterOpen(false)}>
                {t('remix.editorDone')}
              </button>
            </div>
          </div>

          <div
            className="remix-editor-body"
            /*
             * In Play focus the body is the map PiP — tap it to return to Edit.
             * In Edit focus the board handles its own clicks; this wrapper stays inert.
             */
            onClick={editorFocus === 'play' ? () => setEditorFocus('edit') : undefined}
            onKeyDown={
              editorFocus === 'play'
                ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setEditorFocus('edit');
                    }
                  }
                : undefined
            }
            role={editorFocus === 'play' ? 'button' : undefined}
            tabIndex={editorFocus === 'play' ? 0 : undefined}
            aria-label={editorFocus === 'play' ? t('remix.editorFocusEdit') : undefined}
          >
            {editorFocus === 'play' ? (
              <span className="remix-editor-pip-badge">
                <span className="remix-editor-pip-dot" aria-hidden="true" />
                {t('remix.editorPipMap')}
              </span>
            ) : null}
            <RemixPainter content={session.content} doc={contentDoc} onChange={paintContent} />
            {editorFocus === 'play' ? <span className="remix-editor-pip-cta">{t('remix.editorFocusEdit')}</span> : null}
          </div>

          {/*
           * Covers the host-positioned game PiP in Edit focus so a tap flips to
           * Play without fighting the iframe for the gesture.
           */}
          {editorFocus === 'edit' ? (
            <button
              type="button"
              className="remix-editor-game-pip-hit"
              onClick={() => setEditorFocus('play')}
              aria-label={t('remix.editorFocusPlay')}
            >
              <span className="remix-editor-pip-badge">
                <span className="remix-editor-pip-dot" aria-hidden="true" />
                {t('remix.editorPipLive')}
              </span>
              <span className="remix-editor-pip-cta">{t('remix.editorFocusPlay')}</span>
            </button>
          ) : null}
        </div>
        <AuthModal
          isOpen={authOpen}
          onClose={() => setAuthOpen(false)}
          title={t('remix.signInTitle')}
          subtitle={t('remix.wallSubtitle')}
        />
      </>
    );
  }

  return (
    <div className="remix-panel">
      {/* The sheet's own handle. Decorative — closing is the labelled button. */}
      <span className="remix-grip" aria-hidden="true" />

      <div className="remix-head">
        <span className="remix-title">{t('remix.title')}</span>
        <button type="button" className="remix-close" onClick={props.onClose} aria-label={t('remix.close')}>
          <PixelIcon name="close" size={12} />
        </button>
      </div>

      {lane === 'building' ? (
        /*
         * The wait has a subject. The game is frozen and dimmed behind the sheet
         * rather than replaced, and the player's own words are echoed back, so
         * the beat reads as their change being made rather than as the game
         * having gone away. One line of copy; after eight seconds that line
         * changes and nothing else does.
         */
        <>
          <div className="remix-working" role="status">
            <span className="remix-spinner" aria-hidden="true" />
            <span className="remix-working-copy">
              <b>{t('remix.building')}</b>
              {asked ? <span className="remix-echo">{asked}</span> : null}
            </span>
          </div>
          <span className="remix-bar" aria-hidden="true">
            <i />
          </span>
          <p className="remix-note">{slow ? t('remix.buildingSlow') : t('remix.buildingWait')}</p>
        </>
      ) : changed ? (
        /*
         * The reward, and it is earned: share is the loudest thing here only
         * because a change has actually landed. Undo sits beside it, quiet, and
         * the composer shrinks to a line and waits — the second change is the
         * one that turns a remix into a habit.
         */
        <>
          <p className={`remix-result${changed.broke ? ' is-broken' : ''}`} role="status">
            <span className="remix-tick" aria-hidden="true">
              {changed.broke ? '!' : '✓'}
            </span>
            <span>{changed.broke ? t('remix.brokeIt') : changed.text}</span>
          </p>
          {changed.canShare || undo || changed.undoCode || !changed.broke ? (
            <div className="remix-actions-row">
              {changed.canShare ? (
                <button type="button" className="remix-btn is-primary" onClick={() => void share()}>
                  {t('remix.share')}
                </button>
              ) : null}
              {/*
               * Earned: offered only after a change has landed. Forks the remixed
               * sources into a private Studio draft — never a catalog publish.
               * Quiet next to Share when both are available; primary when Share
               * is not (code-only remixes).
               */}
              {!changed.broke ? (
                <button
                  type="button"
                  className={`remix-btn ${changed.canShare ? 'is-quiet' : 'is-primary'}`}
                  disabled={saving || lane !== 'idle'}
                  onClick={() => void saveAsMine()}
                >
                  {saving ? t('remix.saving') : t('remix.makeItYours')}
                </button>
              ) : null}
              {undo || changed.undoCode ? (
                <button
                  type="button"
                  // A broken game makes going back the only thing worth doing,
                  // so it stops being the quiet option.
                  className={`remix-btn ${changed.broke ? 'is-primary' : 'is-quiet'}`}
                  disabled={lane !== 'idle' || saving}
                  onClick={() => (changed.undoCode ? void undoCode() : undoLast())}
                >
                  {t('remix.undo')}
                </button>
              ) : null}
            </div>
          ) : null}
          {composer(true)}
        </>
      ) : canType ? (
        <>
          {composer(false)}
          {showSuggestions ? (
            /*
             * Three things worth saying, derived from what this game can
             * actually do. An empty field over a paused game is where most
             * people close the panel; these answer "what do I even say" and
             * teach the register at the same time.
             *
             * Tapping one *fills the box*; it does not send. A mis-tap should
             * cost a keystroke to undo, not a rebuild — and the sentence is
             * worth more as something to edit than as something to submit
             * whole, since the nearest suggestion is rarely the exact wish.
             */
            <div className={`remix-tries${suggestionsArmed ? '' : ' is-arming'}`}>
              {suggestions.map((suggestion) => {
                const text = suggestionText(suggestion);
                if (!text) return null;
                return (
                  <button
                    key={suggestion.kind === 'param' ? `p:${suggestion.key}` : `s:${suggestion.id}`}
                    type="button"
                    className="remix-try"
                    disabled={!suggestionsArmed}
                    onClick={() => {
                      setUtterance(text);
                      inputRef.current?.focus();
                    }}
                  >
                    {text}
                  </button>
                );
              })}
            </div>
          ) : null}
        </>
      ) : session?.content ? null : (
        /*
         * No lane answers here — the game declares no parameters, its code
         * cannot be assembled, and there is nothing to paint. The panel has to
         * say so: a surface whose whole promise is "say what you want" cannot
         * open with no place to say it and no explanation, which reads as
         * broken rather than as not-yet. (A game with declared content skips
         * this branch — its painter opened above, and it is a full answer.)
         */
        <p className="remix-note is-info" role="status">
          {t('remix.notHere')}
        </p>
      )}

      {note && lane !== 'building' ? (
        <p className={`remix-note is-${note.kind}`} role="status">
          {note.text}
        </p>
      ) : null}
      {/*
       * The brush no longer lives in the sheet, so leave a door back after Done,
       * when the router proposed the editor, or when the painter is the only lane.
       * Assist/code games that never opened it still rely on the quiet menu entry.
       */}
      {session?.content &&
      !painterOpen &&
      lane !== 'building' &&
      (painterOffer || painterSeen || (!session.canAssist && !session.canCode)) ? (
        <div className="remix-actions-row">
          <button
            type="button"
            className="remix-btn is-primary"
            onClick={() => openPainter(painterOffer ? 'redirect' : (painterDoorRef.current ?? 'panel'))}
          >
            {t('remix.openEditor')}
          </button>
        </div>
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
       * Save-as-yours is earned and sequential: change something first, then
       * keep it. The button lives in the post-change actions row above — never
       * as a standing CTA under an empty composer (owner decision, 2026-08-02).
       */}
      {/*
       * Expert mode is the owner's debug surface, not the player's, so its share
       * is not held to the earned-reward rule — moving a slider is a change, and
       * this is where sliders live. It does step aside when the earned button is
       * already on screen, because two share buttons is a bug in any mode.
       */}
      {expert && specs && !changed?.canShare ? (
        <div className="remix-actions">
          <button type="button" className="remix-action" onClick={() => void share()}>
            {t('remix.share')}
          </button>
        </div>
      ) : null}
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

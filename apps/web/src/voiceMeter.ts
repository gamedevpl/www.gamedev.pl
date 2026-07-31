import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';

/**
 * Shell half of GameKit loudness (voice-on-phones Layer 0).
 *
 * Published games run in an opaque-origin sandboxed iframe (`allow-scripts` without
 * `allow-same-origin`). Browsers reject `getUserMedia` there even when the iframe has
 * `allow="microphone"`, so the top-level theater captures the mic after a real header
 * gesture and relays smoothed-ready levels into the frame over the gdp bridge.
 *
 * Nothing runs until a game posts `voice:hello` (createVoiceMeter while embedded), so
 * mounting this for every published play costs silent games nothing.
 */

export type VoiceMeterShellStatus = 'unsupported' | 'idle' | 'pending' | 'live' | 'denied';

export type VoiceMeterGameMessage = { t: 'voice:hello' } | { t: 'voice:stop' };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Narrows one message out of the game frame. Returns null for anything else. */
export function parseVoiceMeterMessage(raw: unknown): VoiceMeterGameMessage | null {
  if (!isObject(raw) || raw.ns !== BRIDGE_NAMESPACE || raw.v !== PROTOCOL_VERSION) return null;
  // `voice:start` is deliberately rejected: sticky mic permission would let untrusted
  // iframe code open capture without a theater Mic gesture (Codex P1 on #406).
  if (raw.t === 'voice:hello' || raw.t === 'voice:stop') {
    return { t: raw.t };
  }
  return null;
}

function mediaSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    !!(window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
  );
}

/**
 * Captures microphone loudness on the real origin and posts `voice:state` /
 * `voice:level` into `frameRef`. Returns UI state for the theater Mic control.
 */
export function useVoiceMeterBridge(frameRef: MutableRefObject<HTMLIFrameElement | null>) {
  const [available, setAvailable] = useState(false);
  const [status, setStatus] = useState<VoiceMeterShellStatus>(() => (mediaSupported() ? 'idle' : 'unsupported'));

  const statusRef = useRef(status);
  statusRef.current = status;
  const availableRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeDomainRef = useRef<Uint8Array | null>(null);
  const rafRef = useRef<number | null>(null);
  const levelRef = useRef(0);

  const postToGame = useCallback(
    (payload: Record<string, unknown>) => {
      frameRef.current?.contentWindow?.postMessage({ ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, ...payload }, '*');
    },
    [frameRef],
  );

  const publishStatus = useCallback(
    (next: VoiceMeterShellStatus) => {
      statusRef.current = next;
      setStatus(next);
      if (availableRef.current) postToGame({ t: 'voice:state', status: next });
    },
    [postToGame],
  );

  const teardown = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    analyserRef.current = null;
    timeDomainRef.current = null;
    levelRef.current = 0;
    if (contextRef.current) {
      try {
        void contextRef.current.close();
      } catch {
        /* ignore */
      }
      contextRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
  }, []);

  const stopMic = useCallback(() => {
    teardown();
    if (statusRef.current === 'unsupported') return;
    publishStatus('idle');
  }, [publishStatus, teardown]);

  const pumpLevels = useCallback(() => {
    const analyser = analyserRef.current;
    const timeDomain = timeDomainRef.current;
    if (!analyser || !timeDomain || statusRef.current !== 'live') return;
    analyser.getByteTimeDomainData(timeDomain as Uint8Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < timeDomain.length; i++) {
      const v = (timeDomain[i]! - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / timeDomain.length);
    const boosted = Math.min(1, rms * 4);
    // Light shell-side smoothing; the kit applies its own smoothing on top.
    levelRef.current = levelRef.current * 0.55 + boosted * 0.45;
    postToGame({ t: 'voice:level', value: levelRef.current });
    rafRef.current = requestAnimationFrame(pumpLevels);
  }, [postToGame]);

  const startMic = useCallback(() => {
    if (!availableRef.current) return;
    if (statusRef.current === 'live' || statusRef.current === 'pending' || statusRef.current === 'unsupported') {
      return;
    }
    if (!mediaSupported()) {
      publishStatus('unsupported');
      return;
    }

    const AC =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    // Unlock inside the theater Mic gesture before awaiting permission.
    if (!contextRef.current) contextRef.current = new AC();
    if (contextRef.current.state === 'suspended') void contextRef.current.resume();

    publishStatus('pending');
    void navigator.mediaDevices
      .getUserMedia({ audio: true, video: false })
      .then((mediaStream) => {
        if (statusRef.current !== 'pending' || document.hidden || !availableRef.current) {
          for (const track of mediaStream.getTracks()) track.stop();
          if (statusRef.current === 'pending' && document.hidden) stopMic();
          return;
        }
        streamRef.current = mediaStream;
        const context = contextRef.current;
        if (!context) {
          for (const track of mediaStream.getTracks()) track.stop();
          publishStatus('unsupported');
          return;
        }
        const source = context.createMediaStreamSource(mediaStream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.4;
        analyserRef.current = analyser;
        timeDomainRef.current = new Uint8Array(analyser.fftSize);
        source.connect(analyser);
        if (context.state === 'suspended') void context.resume();
        publishStatus('live');
        rafRef.current = requestAnimationFrame(pumpLevels);
      })
      .catch(() => {
        teardown();
        publishStatus('denied');
      });
  }, [publishStatus, pumpLevels, stopMic, teardown]);

  const toggle = useCallback(() => {
    if (statusRef.current === 'live' || statusRef.current === 'pending') stopMic();
    else startMic();
  }, [startMic, stopMic]);

  useEffect(() => {
    let cancelled = false;

    function onMessage(event: MessageEvent) {
      if (cancelled) return;
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return;
      const message = parseVoiceMeterMessage(event.data);
      if (!message) return;

      if (message.t === 'voice:hello') {
        availableRef.current = true;
        setAvailable(true);
        const initial: VoiceMeterShellStatus = mediaSupported()
          ? statusRef.current === 'live' || statusRef.current === 'pending' || statusRef.current === 'denied'
            ? statusRef.current
            : 'idle'
          : 'unsupported';
        publishStatus(initial);
        return;
      }

      if (!availableRef.current) return;

      if (message.t === 'voice:stop') {
        stopMic();
      }
    }

    function onVisibility() {
      if (document.hidden && (statusRef.current === 'live' || statusRef.current === 'pending')) {
        stopMic();
      }
    }

    window.addEventListener('message', onMessage);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', onVisibility);
      availableRef.current = false;
      teardown();
    };
  }, [frameRef, publishStatus, stopMic, teardown]);

  return {
    /** True once a game with createVoiceMeter has said hello. */
    available,
    status,
    live: status === 'live',
    toggle,
    stop: stopMic,
  };
}

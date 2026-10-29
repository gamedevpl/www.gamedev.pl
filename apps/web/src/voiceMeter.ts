import { useFrameDocument } from './frameLifecycle.js';
import { isGameFrameNavigatedAway, isFromGameFrame, postToGameFrame } from './frameMessage.js';
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { BRIDGE_NAMESPACE, PROTOCOL_VERSION } from './mp/protocol.js';
import { setCaptureAudioSession } from './audioSession.js';
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

const MIC_KEY = 'gdp.voiceMeter.mic';

function savedMic(): string | null {
  try {
    return localStorage.getItem(MIC_KEY);
  } catch {
    return null;
  }
}

function saveMic(deviceId: string) {
  try {
    localStorage.setItem(MIC_KEY, deviceId);
  } catch {
    /* ignore */
  }
}

/** A microphone's name without Chrome's "Default - " prefix and USB id suffix. */
export function micName(label: string): string {
  return label
    .replace(/^default\s*-\s*/i, '')
    .replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '')
    .trim();
}

/** A mic name short enough for the theater bar. */
export function shortMic(name: string): string {
  return name.length > 14 ? `${name.slice(0, 13).trimEnd()}…` : name;
}

/** The real microphones, without Chrome's "default" and "communications" aliases. */
async function audioInputs(): Promise<MediaDeviceInfo[]> {
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices?.()) ?? [];
    return devices.filter(
      (d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications',
    );
  } catch {
    return [];
  }
}

export function useVoiceMeterBridge(frameRef: MutableRefObject<HTMLIFrameElement | null>) {
  const frameDocument = useFrameDocument(frameRef);
  const [available, setAvailable] = useState(false);
  const [status, setStatus] = useState<VoiceMeterShellStatus>(() => (mediaSupported() ? 'idle' : 'unsupported'));
  // macOS hands Chrome an iPhone nearby (Continuity) as the mic, so the player must see which one listens.
  const [device, setDevice] = useState<string | null>(null);
  const [inputs, setInputs] = useState(0);

  const statusRef = useRef(status);
  statusRef.current = status;
  const availableRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeDomainRef = useRef<Uint8Array | null>(null);
  const rafRef = useRef<number | null>(null);
  const levelRef = useRef(0);
  const acquisition = useRef(0);
  const postToGame = useCallback(
    (payload: Record<string, unknown>) => {
      postToGameFrame(frameRef.current, { ns: BRIDGE_NAMESPACE, v: PROTOCOL_VERSION, ...payload });
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
    acquisition.current++;
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
    setDevice(null);
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

  const startMic = useCallback(
    (deviceId?: string) => {
      if (!availableRef.current || isGameFrameNavigatedAway(frameRef.current)) return;
      if (statusRef.current === 'live' || statusRef.current === 'pending' || statusRef.current === 'unsupported') {
        return;
      }
      if (!mediaSupported()) {
        publishStatus('unsupported');
        return;
      }

      const AC =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      setCaptureAudioSession();
      if (!contextRef.current) contextRef.current = new AC();
      if (contextRef.current.state === 'suspended') void contextRef.current.resume();

      const generation = ++acquisition.current;
      publishStatus('pending');
      const wanted = deviceId ?? savedMic();
      void navigator.mediaDevices
        .getUserMedia({
          audio: wanted ? { deviceId: deviceId ? { exact: wanted } : { ideal: wanted } } : true,
          video: false,
        })
        .then((mediaStream) => {
          if (
            generation !== acquisition.current ||
            statusRef.current !== 'pending' ||
            document.hidden ||
            !availableRef.current ||
            isGameFrameNavigatedAway(frameRef.current)
          ) {
            for (const track of mediaStream.getTracks()) track.stop();
            if (generation === acquisition.current && document.hidden) stopMic();
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
          const track = mediaStream.getAudioTracks?.()[0];
          setDevice(track?.label ? micName(track.label) : null);
          void audioInputs().then((list) => setInputs(list.length));
          rafRef.current = requestAnimationFrame(pumpLevels);
        })
        .catch(() => {
          if (generation !== acquisition.current) return;
          teardown();
          publishStatus('denied');
        });
    },
    [frameRef, publishStatus, pumpLevels, stopMic, teardown],
  );

  const toggle = useCallback(() => {
    if (statusRef.current === 'live' || statusRef.current === 'pending') stopMic();
    else startMic();
  }, [startMic, stopMic]);

  /** Listens through the next microphone and remembers it for the next game. */
  const switchMic = useCallback(async () => {
    if (statusRef.current !== 'live') return;
    const list = await audioInputs();
    if (list.length < 2 || statusRef.current !== 'live') return;
    const current = streamRef.current?.getAudioTracks?.()[0]?.getSettings?.().deviceId;
    const next = list[(list.findIndex((d) => d.deviceId === current) + 1) % list.length]!;
    saveMic(next.deviceId);
    teardown();
    statusRef.current = 'idle';
    startMic(next.deviceId);
  }, [startMic, teardown]);

  useEffect(() => {
    let cancelled = false;

    function onMessage(event: MessageEvent) {
      if (cancelled) return;
      if (!isFromGameFrame(event, frameRef.current)) return;
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
      setAvailable(false);
      stopMic();
    };
  }, [frameRef, publishStatus, stopMic, teardown, frameDocument]);

  return {
    /** True once a game with createVoiceMeter has said hello. */
    available,
    status,
    live: status === 'live',
    /** The listening microphone's name while live. */
    device,
    canSwitch: status === 'live' && inputs > 1,
    switchMic,
    toggle,
    stop: stopMic,
  };
}

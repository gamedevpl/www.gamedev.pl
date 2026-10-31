import { useCallback, useState } from 'react';

const MIC_KEY = 'gdp.voiceMeter.mic';

export function mediaSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function' &&
    !!(window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
  );
}

// Loudness 0..1 of one analyser frame, boosted for shout games.
export function frameLevel(analyser: AnalyserNode, timeDomain: Uint8Array): number {
  analyser.getByteTimeDomainData(timeDomain as Uint8Array<ArrayBuffer>);
  let sum = 0;
  for (let i = 0; i < timeDomain.length; i++) {
    const v = (timeDomain[i]! - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / timeDomain.length) * 4);
}

function savedMic(): string | null {
  try {
    return localStorage.getItem(MIC_KEY);
  } catch {
    return null;
  }
}

// The picked mic exactly, else the remembered one if present.
export function micConstraints(deviceId?: string): MediaStreamConstraints {
  const wanted = deviceId ?? savedMic();
  return { audio: wanted ? { deviceId: deviceId ? { exact: wanted } : { ideal: wanted } } : true, video: false };
}

// Mic name without Chrome's "Default - " prefix and USB id.
export function micName(label: string): string {
  return label
    .replace(/^default\s*-\s*/i, '')
    .replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '')
    .trim();
}

// Short enough for the theater bar.
export function shortMic(name: string): string {
  return name.length > 14 ? `${name.slice(0, 13).trimEnd()}…` : name;
}

// Real microphones, without Chrome's default and communications aliases.
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

// Next mic after the listening one, remembered; null with one mic.
export async function nextMic(stream: MediaStream | null): Promise<string | null> {
  const list = await audioInputs();
  if (list.length < 2) return null;
  const settings = stream?.getAudioTracks?.()[0]?.getSettings?.() ?? {};
  // First capture reports "default"; its groupId names the real device.
  let at = list.findIndex((d) => d.deviceId === settings.deviceId);
  if (at < 0) at = list.findIndex((d) => !!settings.groupId && d.groupId === settings.groupId);
  const next = list[(at + 1) % list.length]!.deviceId;
  try {
    localStorage.setItem(MIC_KEY, next);
  } catch {
    // Storage blocked: the pick lasts this session only.
  }
  return next;
}

// Which mic listens: macOS may pick a nearby iPhone silently.
export function useMicDevice() {
  const [device, setDevice] = useState<string | null>(null);
  const [inputs, setInputs] = useState(0);
  const heard = useCallback((stream: MediaStream) => {
    const label = stream.getAudioTracks?.()[0]?.label;
    setDevice(label ? micName(label) : null);
    void audioInputs().then((list) => setInputs(list.length));
  }, []);
  const clear = useCallback(() => {
    setDevice(null);
    setInputs(0);
  }, []);
  return { device, canSwitch: inputs > 1, heard, clear };
}

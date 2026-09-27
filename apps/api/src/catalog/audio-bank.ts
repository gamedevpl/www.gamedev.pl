import { decodeCanonicalBase64 } from '../platform/canonical-base64.js';

export interface BankSource {
  // Candidate sources win; with noRefFallback the repo is never read.
  overrides?: Record<string, string>;
  noRefFallback?: boolean;
  read: (relPath: string) => Promise<Uint8Array | null>;
}

async function clipBytes(rel: string, src: BankSource): Promise<Uint8Array | null> {
  if (src.overrides && Object.hasOwn(src.overrides, rel)) {
    try {
      return decodeCanonicalBase64(src.overrides[rel]);
    } catch {
      return null;
    }
  }
  return src.noRefFallback ? null : await src.read(rel);
}

// Prepends catalog sounds and per-game audio.bank clips.
export async function prependAudio(
  chunks: string[],
  assets: Record<string, string>,
  bank: Record<string, string>,
  src: BankSource,
): Promise<boolean> {
  if (Object.keys(assets).length > 0) {
    chunks.unshift(`window.__GAME_AUDIO_ASSETS__ = Object.freeze(${JSON.stringify(assets)});`);
  }
  const names = Object.keys(bank);
  if (names.length === 0) return true;
  const clips = await Promise.all(names.map((name) => clipBytes(bank[name], src)));
  if (clips.some((clip) => clip === null)) return false;
  const out: Record<string, string> = {};
  names.forEach((name, i) => {
    out[name] = `data:audio/mpeg;base64,${Buffer.from(clips[i] as Uint8Array).toString('base64')}`;
  });
  chunks.unshift(`window.__GAME_AUDIO_BANK__ = Object.freeze(${JSON.stringify(out)});`);
  return true;
}

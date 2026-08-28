import type { InputKey } from '../../mp/protocol.js';

/** Bilingual phrase → party key. One-shot recognition maps a final transcript onto these. */
export const VOICE_PHRASES: Array<{ key: InputKey; phrases: string[] }> = [
  { key: 'up', phrases: ['up', 'góra', 'gora'] },
  { key: 'down', phrases: ['down', 'dół', 'dol'] },
  { key: 'left', phrases: ['left', 'lewo'] },
  { key: 'right', phrases: ['right', 'prawo'] },
  {
    key: 'a',
    phrases: ['a', 'go', 'fire', 'action', 'jump', 'akcja', 'strzał', 'strzal', 'ogień', 'ogien', 'skok'],
  },
];

export function mapTranscriptToKey(transcript: string): InputKey | null {
  const normalized = transcript.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (!normalized) return null;
  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  for (const entry of VOICE_PHRASES) {
    for (const phrase of entry.phrases) {
      const plain = phrase.normalize('NFD').replace(/\p{M}/gu, '');
      if (tokens.includes(plain) || normalized === plain) return entry.key;
    }
  }
  return null;
}

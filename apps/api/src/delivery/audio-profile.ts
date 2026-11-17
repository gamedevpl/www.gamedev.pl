// A game's audio choices, measured against its pinned kit.
import { KIT_ROOT_DIR } from '../platform/kit-registry.js';

export type AudioProfile = {
  music: string | null;
  customMusic: boolean;
  sounds: number;
  sourcedSounds: number;
  // The starter whose sound set this game ships unchanged.
  starterCopy: string | null;
  starterMusic: boolean;
  // Sounds the builder wanted and the catalog lacked.
  wanted: string[];
};

type KitFiles = { files: Map<string, Buffer> };
type AudioBlock = { sounds: string[]; music: string | null; wanted: string[] };

const STARTER_MANIFEST = new RegExp(`^${KIT_ROOT_DIR}/starters/([^/]+)/GAME\\.json$`);
const MAX_WANTED = 8;
const MAX_WANTED_CHARS = 80;

function audioBlock(source: string): AudioBlock | null {
  let manifest: unknown;
  try {
    manifest = JSON.parse(source);
  } catch {
    return null;
  }
  const audio = (manifest as { audio?: unknown } | null)?.audio;
  if (typeof audio !== 'object' || audio === null || Array.isArray(audio)) return null;
  const { sounds, music, wanted } = audio as Record<string, unknown>;
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
  return {
    sounds: strings(sounds),
    music: typeof music === 'string' && music ? music : null,
    wanted: strings(wanted)
      .map((entry) => entry.trim().slice(0, MAX_WANTED_CHARS))
      .filter(Boolean)
      .slice(0, MAX_WANTED),
  };
}

// ui-toggle is mandatory everywhere, so it says nothing about a choice.
const chosen = (sounds: string[]): string =>
  [...new Set(sounds)]
    .filter((id) => id !== 'ui-toggle')
    .sort()
    .join(',');

function idsOf(tree: KitFiles, file: string, key: 'sounds' | 'tracks'): Set<string> {
  try {
    const parsed = JSON.parse(
      tree.files.get(`${KIT_ROOT_DIR}/shared/audio/${file}`)?.toString('utf8') ?? '{}',
    ) as Record<string, unknown>;
    const map = parsed[key];
    return new Set(map && typeof map === 'object' && !Array.isArray(map) ? Object.keys(map) : []);
  } catch {
    return new Set();
  }
}

export function audioProfile(input: { tree: KitFiles; gameJson: string }): AudioProfile | null {
  const audio = audioBlock(input.gameJson);
  if (!audio) return null;
  const sourced = idsOf(input.tree, 'sourced.json', 'sounds');
  const sharedTracks = idsOf(input.tree, 'music.json', 'tracks');
  const mine = chosen(audio.sounds);
  let starterCopy: string | null = null;
  let starterMusic = false;
  if (mine) {
    for (const [path, content] of input.tree.files) {
      const slug = STARTER_MANIFEST.exec(path)?.[1];
      if (!slug) continue;
      const starter = audioBlock(content.toString('utf8'));
      if (!starter || chosen(starter.sounds) !== mine) continue;
      const sameMusic = starter.music !== null && starter.music === audio.music;
      // Prefer the starter that matches on music too.
      if (!starterCopy || (sameMusic && !starterMusic)) {
        starterCopy = slug;
        starterMusic = sameMusic;
      }
    }
  }
  return {
    music: audio.music,
    customMusic: audio.music !== null && sharedTracks.size > 0 && !sharedTracks.has(audio.music),
    sounds: audio.sounds.length,
    sourcedSounds: audio.sounds.filter((id) => sourced.has(id)).length,
    starterCopy,
    starterMusic,
    wanted: audio.wanted,
  };
}

// Advice, not a defect: a copied set is legal.
export function audioStarterCopyHint(tree: KitFiles, profile: AudioProfile | null): string | null {
  if (!profile?.starterCopy) return null;
  const finder = tree.files.has(`${KIT_ROOT_DIR}/tools/audio-find.ts`)
    ? '`npm run audio:find -- <words>` ranks sounds and music by description (`--music` lists moods)'
    : 'search `shared/audio/sourced.json` for a word (each clip has a `subject`)';
  return (
    `GAME.json audio is the "${profile.starterCopy}" starter's sound set unchanged` +
    `${profile.starterMusic ? ', music included' : ''}. A starter's audio is a placeholder, so this game sounds like ` +
    `every other one built on it. Choose sounds and a music mood that belong to this game's theme: ${finder}. ` +
    'Write a music.json when no shared mood fits, and name sounds the catalog lacks in audio.wanted. ' +
    'Keep the set only if the search shows it is the best fit.'
  );
}

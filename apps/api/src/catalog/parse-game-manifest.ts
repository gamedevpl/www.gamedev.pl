import { GAME_KIT_MODULES, type GameKitModuleName } from '../platform/games-repo-contract.js';
import { parseGameImages, type ImageManifest } from './raster-assets.js';

interface GameManifest {
  engine?: { modules?: unknown };
  audio?: { sounds?: unknown; music?: unknown; musicTracks?: unknown; bank?: unknown };
  images?: unknown;
}

export interface ParsedGameManifest {
  modules: GameKitModuleName[];
  sounds: string[];
  music: string | null;
  musicTracks: string[];
  // Per-game clips; mirrors games-repo tools/lib/audio-bank.ts.
  bank: Record<string, string>;
  images: ImageManifest;
}

function isKebabCaseName(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(value);
}

const BANK_NAME = /^[a-z][a-z0-9-]*$/;
const BANK_PATH = /^audio\/[a-z0-9][a-z0-9/_-]*\.mp3$/;

function parseAudioBank(raw: unknown): Record<string, string> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('game manifest contains invalid audio bank');
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > 64) throw new Error('game manifest audio bank lists too many clips');
  const bank: Record<string, string> = Object.create(null);
  for (const [name, rel] of entries) {
    if (
      !BANK_NAME.test(name) ||
      typeof rel !== 'string' ||
      !BANK_PATH.test(rel) ||
      rel.includes('..') ||
      rel.includes('//')
    ) {
      throw new Error('game manifest contains invalid audio bank');
    }
    bank[name] = rel;
  }
  return bank;
}

export function parseGameManifest(source: string): ParsedGameManifest {
  const manifest = JSON.parse(source) as GameManifest;
  const modules = manifest.engine?.modules;
  if (
    !Array.isArray(modules) ||
    modules.some(
      (moduleName) =>
        typeof moduleName !== 'string' || !GAME_KIT_MODULES.some((allowedModule) => allowedModule === moduleName),
    )
  ) {
    throw new Error('game manifest contains invalid engine modules');
  }

  const expectedOrder = GAME_KIT_MODULES.filter((moduleName) => modules.includes(moduleName));
  if (new Set(modules).size !== modules.length || modules.join(',') !== expectedOrder.join(',')) {
    throw new Error('game manifest engine modules are duplicated or out of order');
  }

  const images = parseGameImages(manifest.images);

  if (!modules.includes('audio')) {
    return { modules: modules as GameKitModuleName[], sounds: [], music: null, musicTracks: [], bank: {}, images };
  }

  const sounds = manifest.audio?.sounds;
  if (
    !Array.isArray(sounds) ||
    sounds.length === 0 ||
    new Set(sounds).size !== sounds.length ||
    !sounds.every(isKebabCaseName)
  ) {
    throw new Error('game manifest contains invalid audio sounds');
  }

  const music = manifest.audio?.music;
  if (!isKebabCaseName(music)) {
    throw new Error('game manifest contains invalid audio music');
  }

  const rawTracks = manifest.audio?.musicTracks;
  let musicTracks: string[] = [];
  if (rawTracks !== undefined) {
    if (
      !Array.isArray(rawTracks) ||
      rawTracks.length === 0 ||
      new Set(rawTracks).size !== rawTracks.length ||
      !rawTracks.every(isKebabCaseName) ||
      rawTracks.includes(music)
    ) {
      throw new Error('game manifest contains invalid audio musicTracks');
    }
    musicTracks = rawTracks;
  }

  return {
    modules: modules as GameKitModuleName[],
    sounds,
    music,
    musicTracks,
    bank: parseAudioBank(manifest.audio?.bank),
    images,
  };
}

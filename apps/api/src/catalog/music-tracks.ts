/**
 * Tracker-style music track parsing shared by serve-time assembly.
 *
 * Real catalogs (shared + per-game) use `{ version: 1, tracks: { id: track } }`.
 * `parseMusicCatalogTracks` is deliberately loose: it only requires a `tracks` map,
 * so serve-time fixtures and older stubs without `version` still resolve membership.
 * Per-game deliveries go through `parseGameMusicTracks`, which enforces the full
 * tracker contract (version, bpm/steps/channels). Self-build agents cannot edit
 * `shared/`, so custom scores ship in the game delivery and merge here.
 */

const VALID_WAVES = new Set(['sine', 'square', 'triangle', 'saw', 'noise', 'kick', 'hat']);
const NOTE_PATTERN = /^(?:[A-G](?:#|b)?-?\d+|K|H)$/;
const TRACK_NAME = /^[a-z0-9][a-z0-9-]*$/;

export type MusicTracksMap = Record<string, unknown>;

/**
 * Loose parse for the shared catalog — tests and older fixtures may carry a
 * minimal stub shape. Membership still uses `Object.hasOwn`.
 */
export function parseMusicCatalogTracks(source: string, label = 'shared audio music catalog'): MusicTracksMap {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} is invalid`);
  }
  const tracks = (parsed as { tracks?: unknown }).tracks;
  if (!tracks || typeof tracks !== 'object' || Array.isArray(tracks)) {
    throw new Error(`${label} is missing tracks`);
  }
  return tracks as MusicTracksMap;
}

/**
 * Strict parse for a per-game `music.json`. Same tracker rules as games-repo
 * `tools/audio.ts` `readMusicCatalog` — invented scores must be playable, not
 * just JSON-shaped.
 */
export function parseGameMusicTracks(source: string, label = 'game music.json'): MusicTracksMap {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} is invalid`);
  }
  const catalog = parsed as { version?: unknown; tracks?: unknown };
  if (catalog.version !== 1) {
    throw new Error(`${label} version must be 1`);
  }
  if (!catalog.tracks || typeof catalog.tracks !== 'object' || Array.isArray(catalog.tracks)) {
    throw new Error(`${label} needs tracks`);
  }
  const tracks = catalog.tracks as Record<string, unknown>;
  const names = Object.keys(tracks);
  if (names.length === 0) {
    throw new Error(`${label} needs at least one track`);
  }
  for (const [name, raw] of Object.entries(tracks)) {
    if (!TRACK_NAME.test(name)) {
      throw new Error(`${label}: invalid music track name "${name}"`);
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`${label}: track "${name}" is invalid`);
    }
    const track = raw as {
      bpm?: unknown;
      steps?: unknown;
      gain?: unknown;
      channels?: unknown;
    };
    if (typeof track.bpm !== 'number' || !Number.isFinite(track.bpm) || track.bpm < 40 || track.bpm > 240) {
      throw new Error(`${label}: ${name}.bpm must be between 40 and 240`);
    }
    if (typeof track.steps !== 'number' || !Number.isInteger(track.steps) || track.steps < 8 || track.steps > 64) {
      throw new Error(`${label}: ${name}.steps must be an integer from 8 to 64`);
    }
    if (
      track.gain !== undefined &&
      (typeof track.gain !== 'number' || !Number.isFinite(track.gain) || track.gain < 0 || track.gain > 1)
    ) {
      throw new Error(`${label}: ${name}.gain must be between 0 and 1`);
    }
    if (!Array.isArray(track.channels) || track.channels.length === 0 || track.channels.length > 8) {
      throw new Error(`${label}: ${name} needs 1–8 channels`);
    }
    for (const [channelIndex, channelRaw] of track.channels.entries()) {
      if (!channelRaw || typeof channelRaw !== 'object' || Array.isArray(channelRaw)) {
        throw new Error(`${label}: ${name} channel ${channelIndex} is invalid`);
      }
      const channel = channelRaw as {
        wave?: unknown;
        gain?: unknown;
        pattern?: unknown;
        name?: unknown;
        intensity?: unknown;
        duration?: unknown;
        sweepFrom?: unknown;
        sweepTo?: unknown;
        frequency?: unknown;
      };
      if (typeof channel.wave !== 'string' || !VALID_WAVES.has(channel.wave)) {
        throw new Error(`${label}: ${name} channel ${channelIndex} has invalid wave`);
      }
      if (
        channel.gain !== undefined &&
        (typeof channel.gain !== 'number' || !Number.isFinite(channel.gain) || channel.gain < 0 || channel.gain > 1)
      ) {
        throw new Error(`${label}: ${name} channel ${channelIndex}.gain must be between 0 and 1`);
      }
      if (channel.name !== undefined && (typeof channel.name !== 'string' || !channel.name)) {
        throw new Error(`${label}: ${name} channel ${channelIndex}.name must be a non-empty string`);
      }
      if (
        channel.intensity !== undefined &&
        (typeof channel.intensity !== 'number' ||
          !Number.isFinite(channel.intensity) ||
          channel.intensity < 0 ||
          channel.intensity > 1)
      ) {
        throw new Error(`${label}: ${name} channel ${channelIndex}.intensity must be between 0 and 1`);
      }
      if (
        channel.duration !== undefined &&
        (typeof channel.duration !== 'number' ||
          !Number.isFinite(channel.duration) ||
          channel.duration <= 0 ||
          channel.duration > 0.9)
      ) {
        throw new Error(`${label}: ${name} channel ${channelIndex}.duration must be between 0 and 0.9`);
      }
      if (channel.wave !== 'kick' && (channel.sweepFrom !== undefined || channel.sweepTo !== undefined)) {
        throw new Error(`${label}: ${name} channel ${channelIndex}.sweepFrom/sweepTo require wave "kick"`);
      }
      for (const key of ['sweepFrom', 'sweepTo'] as const) {
        const value = channel[key];
        if (
          value !== undefined &&
          (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 20000)
        ) {
          throw new Error(`${label}: ${name} channel ${channelIndex}.${key} must be between 0 and 20000`);
        }
      }
      if (channel.wave !== 'hat' && channel.frequency !== undefined) {
        throw new Error(`${label}: ${name} channel ${channelIndex}.frequency requires wave "hat"`);
      }
      if (
        channel.frequency !== undefined &&
        (typeof channel.frequency !== 'number' ||
          !Number.isFinite(channel.frequency) ||
          channel.frequency <= 0 ||
          channel.frequency > 20000)
      ) {
        throw new Error(`${label}: ${name} channel ${channelIndex}.frequency must be between 0 and 20000`);
      }
      if (!Array.isArray(channel.pattern) || channel.pattern.length !== track.steps) {
        throw new Error(`${label}: ${name} channel ${channelIndex}.pattern must have exactly ${track.steps} steps`);
      }
      const percussionWave = channel.wave === 'noise' || channel.wave === 'kick' || channel.wave === 'hat';
      for (const [stepIndex, token] of channel.pattern.entries()) {
        if (token === null) continue;
        if (typeof token !== 'string' || !NOTE_PATTERN.test(token)) {
          throw new Error(`${label}: ${name} channel ${channelIndex} step ${stepIndex} has invalid note`);
        }
        if ((token === 'K' || token === 'H') && !percussionWave) {
          throw new Error(
            `${label}: ${name} channel ${channelIndex} percussion tokens require wave "noise", "kick" or "hat"`,
          );
        }
        if (channel.wave === 'noise' && token !== 'K' && token !== 'H') {
          throw new Error(`${label}: ${name} channel ${channelIndex} noise steps must use K or H`);
        }
        if (channel.wave === 'kick' && token !== 'K') {
          throw new Error(`${label}: ${name} channel ${channelIndex} kick steps must use K`);
        }
        if (channel.wave === 'hat' && token !== 'H') {
          throw new Error(`${label}: ${name} channel ${channelIndex} hat steps must use H`);
        }
      }
    }
    const trackObj = track as { drumKit?: unknown };
    if (trackObj.drumKit !== undefined) {
      if (typeof trackObj.drumKit !== 'object' || trackObj.drumKit === null || Array.isArray(trackObj.drumKit)) {
        throw new Error(`${label}: ${name}.drumKit must be an object`);
      }
      const drumKit = trackObj.drumKit as Record<string, unknown>;
      for (const key of ['kick', 'hat'] as const) {
        const value = drumKit[key];
        if (value === undefined) continue;
        if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(value)) {
          throw new Error(`${label}: ${name}.drumKit.${key} must be a valid sound name`);
        }
      }
    }
  }
  return tracks;
}

/**
 * Merge shared catalog + optional per-game tracks. Game tracks must not collide
 * with a catalog id — reuse a shared mood by naming it from GAME.json, do not
 * redefine it.
 */
export function mergeMusicTrackMaps(catalog: MusicTracksMap, gameTracks: MusicTracksMap | null): MusicTracksMap {
  if (!gameTracks) return catalog;
  const merged: MusicTracksMap = Object.create(null);
  for (const [name, track] of Object.entries(catalog)) {
    merged[name] = track;
  }
  for (const [name, track] of Object.entries(gameTracks)) {
    if (Object.hasOwn(catalog, name)) {
      throw new Error(`game music.json redefines shared catalog track "${name}"`);
    }
    merged[name] = track;
  }
  return merged;
}

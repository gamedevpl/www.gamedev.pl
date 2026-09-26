import { KIT_ROOT_DIR } from '../platform/kit-registry.js';
import {
  mergeMusicTrackMaps,
  parseGameMusicTracks,
  parseMusicCatalogTracks,
  type MusicTracksMap,
} from '../platform/music-tracks.js';

export function audioCatalogHint(input: {
  tree: { files: Map<string, Buffer> };
  slug: string;
  content: string;
  gameMusicJson: string | null;
}): string | null {
  let manifest: unknown;
  try {
    manifest = JSON.parse(input.content);
  } catch {
    return null; // gameManifestHint already reports invalid JSON
  }
  if (typeof manifest !== 'object' || manifest === null) return null;
  const audio = (manifest as Record<string, unknown>).audio;
  if (typeof audio !== 'object' || audio === null || Array.isArray(audio)) return null;
  const music = (audio as Record<string, unknown>).music;
  const rawTracks = (audio as Record<string, unknown>).musicTracks;
  const musicTracks = Array.isArray(rawTracks) ? rawTracks.filter((t): t is string => typeof t === 'string') : [];
  const wanted = [music, ...musicTracks].filter((t): t is string => typeof t === 'string' && t.length > 0);
  if (wanted.length === 0) return null;

  const catalogEntry = input.tree.files.get(`${KIT_ROOT_DIR}/shared/audio/music.json`);
  if (!catalogEntry) return null;
  let catalog: MusicTracksMap;
  try {
    catalog = parseMusicCatalogTracks(catalogEntry.toString('utf8'));
  } catch {
    return null;
  }

  let gameTracks: MusicTracksMap | null = null;
  if (input.gameMusicJson) {
    try {
      gameTracks = parseGameMusicTracks(input.gameMusicJson);
    } catch {
      // Invalid staged/delivered music.json is separate — do not block on it.
      return null;
    }
  }

  let merged: MusicTracksMap;
  try {
    merged = mergeMusicTrackMaps(catalog, gameTracks);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  const unknown = wanted.find((name) => !Object.hasOwn(merged, name));
  if (!unknown) return null;
  return (
    `${input.slug} selects unknown music track "${unknown}" — this is the same check the preview gate's smoke ` +
    `stage runs, so submit_sources will fail with this exact error. Valid ids: ${Object.keys(merged).sort().join(', ')}` +
    (gameTracks
      ? ''
      : ", or add it to a staged music.json (get_kit_api's Audio catalog section lists the shared ones).")
  );
}

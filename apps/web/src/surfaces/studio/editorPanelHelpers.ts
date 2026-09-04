import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  EditorCollectionSpec,
  EditorContentDoc,
  EditorItemContent,
  EditorLabel,
  EditorParamValue,
  EditorPathSpec,
  EditorTilemapSpec,
  GameEditorState,
} from '../../studioApi.js';

export function useLabel(): (label: EditorLabel) => string {
  const { i18n } = useTranslation();
  return useCallback((label: EditorLabel) => (i18n.language?.startsWith('pl') ? label.pl : label.en), [i18n.language]);
}

// A saved draft over the game's current defaults.

// Params added after the draft was saved must not come back missing.
export function mergeDraft(loaded: GameEditorState): EditorContentDoc {
  if (!loaded.draft) return loaded.content;
  const merged: EditorContentDoc = { ...loaded.content, ...loaded.draft.content };
  if (loaded.definition.params) {
    merged.params = {
      ...((loaded.content.params ?? {}) as Record<string, EditorParamValue>),
      ...((loaded.draft.content.params ?? {}) as Record<string, EditorParamValue>),
    };
  }
  return merged;
}

// A collection's items out of the mixed content document.
export function itemsOf(doc: EditorContentDoc, key: string): EditorItemContent[] {
  return (doc[key] ?? []) as EditorItemContent[];
}

// The palette's initial selection: entities have no tiles.
export function firstTileKey(spec: EditorCollectionSpec | undefined): string | null {
  if (!spec || spec.item.widget !== 'tilemap') return null;
  return spec.item.tiles.find((tile) => tile.key.length > 0)?.key ?? null;
}

// Narrows to a tilemap spec: entities render no board.
export function tilemapCollection(
  spec: EditorCollectionSpec | null,
): (EditorCollectionSpec & { item: EditorTilemapSpec }) | null {
  return spec && spec.item.widget === 'tilemap' ? (spec as EditorCollectionSpec & { item: EditorTilemapSpec }) : null;
}

export function pathCollection(
  spec: EditorCollectionSpec | null,
): (EditorCollectionSpec & { item: EditorPathSpec }) | null {
  return spec && spec.item.widget === 'path' ? (spec as EditorCollectionSpec & { item: EditorPathSpec }) : null;
}

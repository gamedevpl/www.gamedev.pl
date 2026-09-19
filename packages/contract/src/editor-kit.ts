// EditorKit types shared by Studio and the API.

export const EDITOR_FILE = 'EDITOR.json';
export const EDITOR_CONTENT_FILE = 'EDITOR.content.json';
export const GENERATED_CONTENT_PATH = 'game/editor-content.ts';
export const EDITOR_SPEC_KEY = 'editor';
export const EDITOR_SPEC_VALUE = 'content';

export const MAX_EDITOR_JSON_BYTES = 64 * 1024;
export const MAX_COLLECTIONS = 4;
export const MAX_COLLECTION_ITEMS = 32;
export const MAX_TILES = 16;
export const MAX_CONSTRAINTS = 8;
export const MAX_PROPERTIES = 12;
export const MAX_TEXT_LENGTH = 240;
export const MAX_ENUM_VALUES = 16;
export const MAX_GRID_COLS = 64;
export const MAX_GRID_ROWS = 64;
export const MAX_PATH_POINTS = 256;
export const MAX_PARAMS = 16;
export const MAX_LAYERS = 8;
export const MAX_LAYER_ITEMS = 64;
export const MAX_LAYER_TOTAL_CELLS = 16_384;
export const PARAMS_KEY = 'params';
export const LAYERS_KEY = 'layers';
export interface EditorLabel {
  en: string;
  pl: string;
}

export interface TileSpec {
  key: string;
  char: string;
  label: EditorLabel;
  color?: string;
}

export type PropertySpec =
  | { type: 'text'; max: number }
  | { type: 'int'; min: number; max: number }
  | { type: 'number'; min: number; max: number }
  | { type: 'enum'; values: string[] }
  | { type: 'bool' };

export type ParamValue = string | number | boolean;

export type ParamSpec = PropertySpec & { label: EditorLabel; default: ParamValue };

export type EditorConstraint =
  | { tile: string; min?: number; max?: number; exactly?: number }
  | { equalCounts: [string, string] }
  | { reachable: { from: string; blockedBy: string[]; require: string[] } }
  | { uniqueBy: string };

export interface TilemapItemSpec {
  widget: 'tilemap';
  grid: { minCols: number; maxCols: number; minRows: number; maxRows: number };
  tiles: TileSpec[];
  properties: Record<string, PropertySpec>;
  constraints: EditorConstraint[];
}

export interface EntitiesItemSpec {
  widget: 'entities';
  properties: Record<string, PropertySpec>;
  constraints: EditorConstraint[];
}

export interface PathItemSpec {
  widget: 'path';
  gridCols: number;
  gridRows: number;
  minPoints: number;
  maxPoints: number;
  closed: boolean;
  properties: Record<string, PropertySpec>;
}

export interface LayeredItemSpec {
  widget: 'layered';
  layers: Record<string, EditorLayerSpec>;
  constraints: EditorLayerConstraint[];
  properties: Record<string, PropertySpec>;
}

export type CollectionItemSpec = TilemapItemSpec | EntitiesItemSpec | PathItemSpec | LayeredItemSpec;

export interface CollectionSpec {
  widget: 'collection';
  label: EditorLabel;
  itemLabel: EditorLabel;
  min: number;
  max: number;
  item: CollectionItemSpec;
  defaults: Array<TilemapItemContent | EntityItemContent | PathItemContent | LayeredItemContent>;
}

export interface TilemapLayerSpec extends TilemapItemSpec {
  label: EditorLabel;
}

export interface EntitiesLayerSpec extends EntitiesItemSpec {
  label: EditorLabel;
  min: number;
  max: number;
}

export type EditorLayerSpec = TilemapLayerSpec | EntitiesLayerSpec;

export type LayerTileRef = { layer: string; tile: string };

export type EditorLayerConstraint = {
  reachable: { from: LayerTileRef; blockedBy: LayerTileRef[]; require: LayerTileRef[] };
};

export interface TilemapItemContent {
  properties: Record<string, unknown>;
  rows: string[];
}

export interface EntityItemContent {
  properties: Record<string, unknown>;
}

export interface PathPoint {
  x: number;
  y: number;
}

export interface PathItemContent {
  properties: Record<string, unknown>;
  points: PathPoint[];
}

export interface LayeredItemContent {
  properties: Record<string, unknown>;
  layers: EditorLayersContent;
}

export type EditorLayerContent = TilemapItemContent | EntityItemContent[];
export type EditorLayersContent = Record<string, EditorLayerContent>;

export type EditorContentDocument = Record<
  string,
  | Array<TilemapItemContent | EntityItemContent | PathItemContent | LayeredItemContent>
  | Record<string, ParamValue>
  | EditorLayersContent
>;

export type EditorVersion = 1 | 2;

export interface EditorDefinition {
  version: EditorVersion;
  params?: Record<string, ParamSpec>;
  content: Record<string, CollectionSpec>;
  layers?: Record<string, EditorLayerSpec>;
  constraints?: EditorLayerConstraint[];
  controller?: true;
  validate?: true;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

import { ImageType } from '../assets/image-types';

export enum TerrainType {
  Grass = 'grass',
  Dirt = 'dirt',
}

export interface TerrainTile {
  type: TerrainType;
  imageType: ImageType;
  x: number;
  y: number;
}

export interface TerrainMap {
  width: number;
  height: number;
  tileSize: number;
  tiles: TerrainTile[][];
}

// Mapping terrain types to their corresponding image assets
export const TERRAIN_IMAGE_MAP: Record<TerrainType, ImageType> = {
  [TerrainType.Grass]: ImageType.GrassTile,
  [TerrainType.Dirt]: ImageType.DirtTile,
};
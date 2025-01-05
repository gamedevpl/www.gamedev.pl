import { Rect2D } from '../utils/math-types';

export type Environment = {
  sectors: Sector[];
};

export type SectorType = 'water' | 'grass';

export interface BaseSector {
  rect: Rect2D;
  type: SectorType;
}

export interface GrassSector extends BaseSector {
  type: 'grass';
  density: number;
}

export interface WaterSector extends BaseSector {
  type: 'water';
  depth: number;
}

export type Sector = GrassSector | WaterSector;

export function isGrassSector(sector: Sector): sector is GrassSector {
  return sector.type === 'grass';
}

export function isWaterSector(sector: Sector): sector is WaterSector {
  return sector.type === 'water';
}

import { ImageType } from '../assets/image-types';
import { Vector2D } from '../utils/math-types';

export enum EnvironmentalObjectType {
  Tree = 'tree',
  Rock = 'rock', 
  Flower = 'flower',
}

export interface EnvironmentalObject {
  id: string;
  type: EnvironmentalObjectType;
  imageType: ImageType;
  position: Vector2D;
  width: number;
  height: number;
}

// Mapping environmental types to their corresponding image assets
export const ENVIRONMENTAL_IMAGE_MAP: Record<EnvironmentalObjectType, ImageType> = {
  [EnvironmentalObjectType.Tree]: ImageType.Tree,
  [EnvironmentalObjectType.Rock]: ImageType.Rock,
  [EnvironmentalObjectType.Flower]: ImageType.Flower,
};
import { EnvironmentalObject, EnvironmentalObjectType, ENVIRONMENTAL_IMAGE_MAP } from './environment-types';

/**
 * Generates environmental objects (trees, rocks, flowers) for the game world
 */
export function generateEnvironmentalObjects(worldWidth: number, worldHeight: number): EnvironmentalObject[] {
  const objects: EnvironmentalObject[] = [];
  let objectId = 0;
  
  // Generate trees - large objects that provide visual landmarks
  const treeCount = Math.floor((worldWidth * worldHeight) / 25000); // About 1 tree per 25k pixels
  for (let i = 0; i < treeCount; i++) {
    objects.push({
      id: `tree-${objectId++}`,
      type: EnvironmentalObjectType.Tree,
      imageType: ENVIRONMENTAL_IMAGE_MAP[EnvironmentalObjectType.Tree],
      position: {
        x: Math.random() * worldWidth,
        y: Math.random() * worldHeight,
      },
      width: 48,
      height: 64,
    });
  }
  
  // Generate rocks - medium objects for visual variety
  const rockCount = Math.floor((worldWidth * worldHeight) / 15000); // About 1 rock per 15k pixels
  for (let i = 0; i < rockCount; i++) {
    objects.push({
      id: `rock-${objectId++}`,
      type: EnvironmentalObjectType.Rock,
      imageType: ENVIRONMENTAL_IMAGE_MAP[EnvironmentalObjectType.Rock],
      position: {
        x: Math.random() * worldWidth,
        y: Math.random() * worldHeight,
      },
      width: 32,
      height: 24,
    });
  }
  
  // Generate flowers - small decorative objects
  const flowerCount = Math.floor((worldWidth * worldHeight) / 8000); // About 1 flower per 8k pixels
  for (let i = 0; i < flowerCount; i++) {
    objects.push({
      id: `flower-${objectId++}`,
      type: EnvironmentalObjectType.Flower,
      imageType: ENVIRONMENTAL_IMAGE_MAP[EnvironmentalObjectType.Flower],
      position: {
        x: Math.random() * worldWidth,
        y: Math.random() * worldHeight,
      },
      width: 16,
      height: 16,
    });
  }
  
  return objects;
}
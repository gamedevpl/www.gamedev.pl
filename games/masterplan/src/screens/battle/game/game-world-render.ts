import { GameWorld } from './game-world';
import { createTerrainTexture } from './terrain/terrain-renderer';

export class GameWorldRender {
  terrainCanvas: HTMLCanvasElement;

  constructor(gameWorld: GameWorld) {
    this.terrainCanvas = createTerrainTexture(
      gameWorld.terrain.width,
      gameWorld.terrain.height,
      gameWorld.terrain.heightMap,
      gameWorld.terrain.tileSize,
    );
  }
}

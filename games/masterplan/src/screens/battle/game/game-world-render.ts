import { GameWorld } from './game-world';
import { interpolateGridValue } from './terrain/terrain';
import { createTerrainTexture } from './terrain/terrain-renderer';

export class GameWorldRender {
  terrainCanvas: HTMLCanvasElement;
  shadingMap: number[][];

  constructor(private gameWorld: GameWorld) {
    const { terrainCanvas, shadingMap } = createTerrainTexture(
      gameWorld.terrain.width,
      gameWorld.terrain.height,
      gameWorld.terrain.heightMap,
      gameWorld.terrain.tileSize,
    );
    this.terrainCanvas = terrainCanvas;
    this.shadingMap = shadingMap;
  }

  getShadingAt(x: number, y: number): number {
    return interpolateGridValue(
      [x, y],
      this.shadingMap,
      this.gameWorld.terrain.tileSize,
      this.gameWorld.terrain.offsetX,
      this.gameWorld.terrain.offsetY,
    );
  }
}

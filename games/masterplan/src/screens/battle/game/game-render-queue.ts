import { Canvas } from '../util/canvas';
import { GameWorldRender } from './game-world-render';

// Define types for render commands
type RenderCommand = {
  layer: 'terrain' | 'deadObjects' | 'shadows' | 'objects' | 'particles';
  x: number;
  y: number;
  z: number;
  fillStyle: string;
  points: number[][];
};

// Define layer order for sorting
const layerOrder: { [key: string]: number } = {
  terrain: 0,
  deadObjects: 1,
  shadows: 2,
  objects: 3,
  particles: 4,
};

export class RenderQueue {
  constructor(private worldRender: GameWorldRender) {}

  private commands: RenderCommand[] = [];

  getShadingAt(x: number, y: number): number {
    return this.worldRender.getShadingAt(x, y);
  }

  renderShape(layer: RenderCommand['layer'], x: number, y: number, z: number, points: number[][], fillStyle: string) {
    this.commands.push({
      layer,
      x,
      y,
      z,
      points,
      fillStyle,
    });
  }

  private sortCommands(commands: RenderCommand[]): RenderCommand[] {
    return commands.sort((a, b) => {
      // Sort by layer
      if (layerOrder[a.layer] !== layerOrder[b.layer]) {
        return layerOrder[a.layer] - layerOrder[b.layer];
      }
      // Then by Y position ascending (using 3D y-position)
      if (a.y !== b.y) {
        return a.y - b.y;
      }
      // Then by Z position ascending
      return a.z - b.z;
    });
  }

  private batchCommands(): RenderCommand[][] {
    const sortedCommands = this.sortCommands(this.commands);
    const batches: RenderCommand[][] = [];
    let currentBatch: RenderCommand[] = [];
    let currentFillStyle: string | undefined;

    for (const command of sortedCommands) {
      if (command.fillStyle !== currentFillStyle && currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
      }
      currentBatch.push(command);
      currentFillStyle = command.fillStyle;
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  render(canvas: Canvas) {
    const batchedCommands = this.batchCommands();

    for (const batch of batchedCommands) {
      canvas.save();
      canvas.fillStyle(batch[0].fillStyle);
      const path = new Path2D();
      for (const command of batch) {
        const firstPoint = command.points[0];
        path.moveTo(command.x + firstPoint[0], command.y + firstPoint[1]);
        for (let i = 1; i < command.points.length; i++) {
          const point = command.points[i];
          path.lineTo(command.x + point[0], command.y + point[1]);
        }
      }
      path.closePath();
      canvas.fill(path);
      canvas.restore();
    }

    // Clear the queue after rendering
    this.commands = [];
  }

  // Helper methods for adding specific types of render commands
  addObjectCommand(x: number, y: number, z: number, isAlive: boolean, fillStyle: string, points: number[][]) {
    this.renderShape(isAlive ? 'objects' : 'deadObjects', x, y, z, points, fillStyle);
  }

  addShadowCommand(x: number, y: number, z: number, fillStyle: string, points: number[][]) {
    this.renderShape('shadows', x, y, z, points, fillStyle);
  }

  addParticleCommand(x: number, y: number, z: number, fillStyle: string, points: number[][]) {
    this.renderShape('particles', x, y, z, points, fillStyle);
  }
}

import { Canvas } from '../util/canvas';

// Define types for render commands
type RenderCommand = {
  layer: 'terrain' | 'deadObjects' | 'shadows' | 'objects' | 'particles';
  z: number;
  y: number;
  fillStyle?: string;
  render: (canvas: Canvas) => void;
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
  private commands: RenderCommand[] = [];

  addCommand(command: RenderCommand) {
    this.commands.push(command);
  }

  private sortCommands(commands: RenderCommand[]): RenderCommand[] {
    return commands.sort((a, b) => {
      // Sort by layer
      if (layerOrder[a.layer] !== layerOrder[b.layer]) {
        return layerOrder[a.layer] - layerOrder[b.layer];
      }
      // Then by Y position ascending
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
      if (batch[0].fillStyle) {
        canvas.fillStyle(batch[0].fillStyle);
      }
      for (const command of batch) {
        command.render(canvas);
      }
      canvas.restore();
    }

    // Clear the queue after rendering
    this.commands = [];
  }

  // Helper methods for adding specific types of render commands
  addObjectCommand(
    z: number,
    y: number,
    isAlive: boolean,
    fillStyle: string | undefined,
    renderFn: (canvas: Canvas) => void,
  ) {
    this.addCommand({ layer: isAlive ? 'objects' : 'deadObjects', z, y, fillStyle, render: renderFn });
  }

  addShadowCommand(z: number, y: number, fillStyle: string | undefined, renderFn: (canvas: Canvas) => void) {
    this.addCommand({ layer: 'shadows', z, y, fillStyle, render: renderFn });
  }

  addParticleCommand(z: number, y: number, fillStyle: string | undefined, renderFn: (canvas: Canvas) => void) {
    this.addCommand({ layer: 'particles', z, y, fillStyle, render: renderFn });
  }
}

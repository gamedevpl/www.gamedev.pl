import { SoldierObject } from './object-soldier';
import { rotate3D, applyPerspective } from './render/3d-rendering';
import { applyShading } from './render/shading';
import { drawPolygon } from './render/polygon-utils';
import { renderShadow } from './render/shadow-renderer';
import { defineShapes, defineFallenShapes, Shape } from './render/shape-definitions';
import { RenderQueue } from '../game-render-queue';

export class SoldierRender {
  private soldier: SoldierObject;
  shapes: { [key: string]: Shape };
  fallenShapes: { [key: string]: Shape };
  private unitColor: string;

  constructor(soldier: SoldierObject) {
    this.soldier = soldier;
    this.shapes = defineShapes(soldier.type);
    this.fallenShapes = defineFallenShapes(soldier.type);
    this.unitColor = soldier.color;
  }

  addRenderCommands(renderQueue: RenderQueue) {
    const z = this.soldier.getZ();
    const y = this.soldier.getY();
    const isAlive = this.soldier.state.isAlive();

    if (isAlive) {
      // Add shadow render command
      renderQueue.addShadowCommand(z, y, 'rgba(0, 0, 0, 0.3)', (canvas) => {
        canvas.save().translate(this.soldier.getX(), this.soldier.getY() - this.soldier.getZ());
        renderShadow(canvas, this.soldier);
        canvas.restore();
      });
    }

    this.renderSoldier(renderQueue);
  }

  private renderSoldier(renderQueue: RenderQueue) {
    const isAlive = this.soldier.state.isAlive();

    const rotationAngle = isAlive ? this.soldier.getDirection() : Math.PI / 2; // Rotate fallen soldiers
    const baseColor = isAlive ? this.unitColor : '#808080';
    const currentShapes = isAlive ? this.shapes : this.fallenShapes;

    // Sort shapes by z-index for proper layering
    const sortedShapes = Object.entries(currentShapes).sort((a, b) => a[1].zIndex - b[1].zIndex);

    // Render each part of the soldier
    for (const [, shape] of sortedShapes) {
      const rotatedPoints = rotate3D(shape.points, rotationAngle + Math.PI / 2);
      const perspectivePoints = rotatedPoints.map((p) => applyPerspective(p));
      const shadedColor = applyShading(baseColor, rotationAngle, this.soldier.state.isAlive() ? 1 : 0.5);

      renderQueue.addObjectCommand(this.soldier.getZ(), this.soldier.getY(), isAlive, shadedColor, (canvas) => {
        drawPolygon(
          this.soldier.getX(),
          this.soldier.getY() - this.soldier.getZ() + (!isAlive ? this.soldier.getHeight() / 2 : 0),
          canvas,
          perspectivePoints,
        );
      });
    }
  }
}

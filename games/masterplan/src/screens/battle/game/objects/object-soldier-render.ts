import { SoldierObject } from './object-soldier';
import { Canvas } from '../../util/canvas';
import { rotate3D, applyPerspective } from './render/3d-rendering';
import { applyShading } from './render/shading';
import { drawPolygon } from './render/polygon-utils';
import { renderShadow } from './render/shadow-renderer';
import { defineShapes, defineFallenShapes, Shape } from './render/shape-definitions';

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

  render(canvas: Canvas) {
    const ctx = canvas.getCtx();
    ctx.save();

    // Render shadow first
    renderShadow(canvas, this.soldier);

    if (!this.soldier.state.isAlive()) {
      ctx.translate(0, this.soldier.getHeight() / 2);
    }

    const rotationAngle = this.soldier.state.isAlive() ? this.soldier.getDirection() : Math.PI / 2; // Rotate fallen soldiers
    const baseColor = this.soldier.state.isAlive() ? this.unitColor : '#808080';
    const currentShapes = this.soldier.state.isAlive() ? this.shapes : this.fallenShapes;

    // Sort shapes by z-index for proper layering
    const sortedShapes = Object.entries(currentShapes).sort((a, b) => a[1].zIndex - b[1].zIndex);

    // Render each part of the soldier
    for (const [_part, shape] of sortedShapes) {
      const rotatedPoints = rotate3D(shape.points, rotationAngle + Math.PI / 2);
      const perspectivePoints = rotatedPoints.map((p) => applyPerspective(p));
      const shadedColor = applyShading(baseColor, rotationAngle);

      ctx.fillStyle = shadedColor;
      drawPolygon(canvas, perspectivePoints);
    }

    ctx.restore();
  }
}

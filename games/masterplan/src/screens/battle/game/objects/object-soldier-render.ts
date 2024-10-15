import { SoldierObject } from './object-soldier';
import { rotate3D, applyPerspective } from './render/3d-rendering';
import { applyShading } from './render/shading';
import { defineShapes, defineFallenShapes } from './render/shape-definitions';
import { RenderQueue } from '../game-render-queue';
import { UnitType } from '../../../designer/designer-types';
import { SOLDIER_HEIGHT, SOLDIER_WIDTH } from '../../consts';

const UNIT_TYPES = ['warrior', 'archer', 'tank', 'artillery'] as UnitType[];
const SHAPES = Object.fromEntries(
  UNIT_TYPES.map((type) => [type, Object.entries(defineShapes(type)).sort((a, b) => a[1].zIndex - b[1].zIndex)]),
);
const FALLEN_SHAPES = Object.fromEntries(
  UNIT_TYPES.map((type) => [type, Object.entries(defineFallenShapes(type)).sort((a, b) => a[1].zIndex - b[1].zIndex)]),
);

const SHADOW_POINTS = Array.from({ length: 20 }, (_, i) => {
  const angle = (i / 20) * 2 * Math.PI;
  return [(SOLDIER_WIDTH / 3) * Math.cos(angle), (SOLDIER_HEIGHT / 4) * Math.sin(angle)];
});

export class SoldierRender {
  private soldier: SoldierObject;
  private unitColor: string;

  constructor(soldier: SoldierObject) {
    this.soldier = soldier;
    this.unitColor = soldier.color;
  }

  addRenderCommands(renderQueue: RenderQueue) {
    if (this.soldier.state.isAlive()) {
      this.renderShadow(renderQueue);
    }

    this.renderSoldier(renderQueue);
  }

  private renderShadow(renderQueue: RenderQueue) {
    renderQueue.addShadowCommand(
      this.soldier.getX(),
      this.soldier.getY() + this.soldier.getHeight() / 2,
      this.soldier.getZ(),
      'rgba(0, 0, 0, 0.3)',
      SHADOW_POINTS,
    );
  }

  private renderSoldier(renderQueue: RenderQueue) {
    const isAlive = this.soldier.state.isAlive();

    const rotationAngle = isAlive ? this.soldier.getDirection() : Math.PI / 2; // Rotate fallen soldiers
    const baseColor = isAlive ? this.unitColor : '#808080';

    // Sort shapes by z-index for proper layering
    const shapes = isAlive ? SHAPES[this.soldier.type] : FALLEN_SHAPES[this.soldier.type];

    // Get terrain shading factor
    const terrainShadingFactor = renderQueue.getShadingAt(...this.soldier.vec);

    // Render each part of the soldier
    for (const [, shape] of shapes) {
      const rotatedPoints = rotate3D(shape.points, rotationAngle + Math.PI / 2);
      const perspectivePoints = rotatedPoints.map((p) => applyPerspective(p));

      // Apply shading to both live and fallen soldiers
      const shadedColor = applyShading(baseColor, rotationAngle, isAlive ? 1 : 0.5);

      // Combine soldier shading with terrain shading
      const finalColor = this.combineColors(shadedColor, terrainShadingFactor);

      renderQueue.addObjectCommand(
        this.soldier.getX(),
        this.soldier.getY() + (isAlive ? 0 : this.soldier.getHeight() / 2),
        this.soldier.getZ(),
        isAlive,
        finalColor,
        perspectivePoints.map((p) => [p.x, p.y]),
      );
    }
  }

  private combineColors(soldierColor: string, terrainShadingFactor: number): string {
    // Parse the soldier color
    const rgbaMatch = soldierColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]+)?\)/);
    if (!rgbaMatch) {
      return soldierColor;
    }

    const r = parseInt(rgbaMatch[1], 10);
    const g = parseInt(rgbaMatch[2], 10);
    const b = parseInt(rgbaMatch[3], 10);
    const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1;

    // Apply terrain shading factor
    const newR = Math.floor(r * terrainShadingFactor);
    const newG = Math.floor(g * terrainShadingFactor);
    const newB = Math.floor(b * terrainShadingFactor);

    // Return the combined color
    return `rgba(${newR},${newG},${newB},${a})`;
  }
}

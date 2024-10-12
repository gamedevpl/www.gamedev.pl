import { SoldierObject } from './object-soldier';
import { Canvas } from '../../util/canvas';
import { UnitType } from '../../../designer/designer-types';

interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface Shape {
  points: Point3D[];
  zIndex: number;
}

export class SoldierRender {
  private soldier: SoldierObject;
  private shapes: { [key: string]: Shape };
  private fallenShapes: { [key: string]: Shape };
  private unitColor: string;

  constructor(soldier: SoldierObject) {
    this.soldier = soldier;
    this.shapes = this.defineShapes(soldier.type);
    this.fallenShapes = this.defineFallenShapes(soldier.type);
    this.unitColor = this.getUnitColor(soldier.type);
  }

  private defineShapes(unitType: UnitType): { [key: string]: Shape } {
    const baseShapes = {
      head: {
        points: [
          { x: -5, y: -15, z: 5 },
          { x: 5, y: -15, z: 5 },
          { x: 5, y: -5, z: 5 },
          { x: -5, y: -5, z: 5 },
        ],
        zIndex: 3,
      },
      body: {
        points: [
          { x: -7, y: -5, z: 0 },
          { x: 7, y: -5, z: 0 },
          { x: 7, y: 10, z: 0 },
          { x: -7, y: 10, z: 0 },
        ],
        zIndex: 2,
      },
      legs: {
        points: [
          { x: -7, y: 10, z: -2 },
          { x: -3, y: 10, z: -2 },
          { x: -3, y: 15, z: -2 },
          { x: -7, y: 15, z: -2 },
          { x: 3, y: 10, z: -2 },
          { x: 7, y: 10, z: -2 },
          { x: 7, y: 15, z: -2 },
          { x: 3, y: 15, z: -2 },
        ],
        zIndex: 1,
      },
    };

    switch (unitType) {
      case 'warrior':
        return {
          ...baseShapes,
          sword: {
            points: [
              { x: 8, y: -5, z: 3 },
              { x: 18, y: -10, z: 3 },
              { x: 20, y: -8, z: 3 },
              { x: 10, y: -3, z: 3 },
            ],
            zIndex: 4,
          },
        };
      case 'archer':
        return {
          ...baseShapes,
          bow: {
            points: [
              { x: 8, y: -10, z: 3 },
              { x: 12, y: -8, z: 3 },
              { x: 12, y: 8, z: 3 },
              { x: 8, y: 10, z: 3 },
            ],
            zIndex: 4,
          },
          arrow: {
            points: [
              { x: 12, y: 0, z: 4 },
              { x: 20, y: -2, z: 4 },
              { x: 20, y: 2, z: 4 },
            ],
            zIndex: 5,
          },
        };
      case 'tank':
        return {
          ...baseShapes,
          shield: {
            points: [
              { x: -12, y: -10, z: 5 },
              { x: -8, y: -12, z: 5 },
              { x: -8, y: 12, z: 5 },
              { x: -12, y: 10, z: 5 },
            ],
            zIndex: 4,
          },
        };
      case 'artillery':
        return {
          ...baseShapes,
          cannon: {
            points: [
              { x: 8, y: -3, z: 3 },
              { x: 20, y: -3, z: 3 },
              { x: 20, y: 3, z: 3 },
              { x: 8, y: 3, z: 3 },
            ],
            zIndex: 4,
          },
        };
      default:
        return baseShapes;
    }
  }

  private defineFallenShapes(unitType: UnitType): { [key: string]: Shape } {
    const baseFallenShapes = {
      head: {
        points: [
          { x: -5, y: -2, z: 5 },
          { x: 5, y: -2, z: 5 },
          { x: 5, y: 8, z: 5 },
          { x: -5, y: 8, z: 5 },
        ],
        zIndex: 3,
      },
      body: {
        points: [
          { x: -7, y: -10, z: 0 },
          { x: 7, y: -10, z: 0 },
          { x: 7, y: 5, z: 0 },
          { x: -7, y: 5, z: 0 },
        ],
        zIndex: 2,
      },
      legs: {
        points: [
          { x: -7, y: -15, z: -2 },
          { x: -3, y: -15, z: -2 },
          { x: -3, y: -10, z: -2 },
          { x: -7, y: -10, z: -2 },
          { x: 3, y: -15, z: -2 },
          { x: 7, y: -15, z: -2 },
          { x: 7, y: -10, z: -2 },
          { x: 3, y: -10, z: -2 },
        ],
        zIndex: 1,
      },
    };

    switch (unitType) {
      case 'warrior':
        return {
          ...baseFallenShapes,
          sword: {
            points: [
              { x: 5, y: -8, z: 1 },
              { x: 15, y: -5, z: 1 },
              { x: 15, y: -3, z: 1 },
              { x: 5, y: -6, z: 1 },
            ],
            zIndex: 4,
          },
        };
      case 'archer':
        return {
          ...baseFallenShapes,
          bow: {
            points: [
              { x: 5, y: -10, z: 1 },
              { x: 10, y: -8, z: 1 },
              { x: 10, y: 2, z: 1 },
              { x: 5, y: 4, z: 1 },
            ],
            zIndex: 4,
          },
          arrow: {
            points: [
              { x: 10, y: -2, z: 2 },
              { x: 18, y: -1, z: 2 },
              { x: 18, y: 1, z: 2 },
            ],
            zIndex: 5,
          },
        };
      case 'tank':
        return {
          ...baseFallenShapes,
          shield: {
            points: [
              { x: -10, y: -8, z: 4 },
              { x: -6, y: -9, z: 4 },
              { x: -6, y: 5, z: 4 },
              { x: -10, y: 4, z: 4 },
            ],
            zIndex: 4,
          },
        };
      case 'artillery':
        return {
          ...baseFallenShapes,
          cannon: {
            points: [
              { x: 6, y: -5, z: 2 },
              { x: 16, y: -4, z: 2 },
              { x: 16, y: 2, z: 2 },
              { x: 6, y: 1, z: 2 },
            ],
            zIndex: 4,
          },
        };
      default:
        return baseFallenShapes;
    }
  }

  private getUnitColor(unitType: UnitType): string {
    switch (unitType) {
      case 'warrior':
        return '#FF0000';
      case 'archer':
        return '#00FF00';
      case 'tank':
        return '#0000FF';
      case 'artillery':
        return '#FFFF00';
      default:
        return '#FFFFFF';
    }
  }

  private rotate3D(points: Point3D[], angle: number): Point3D[] {
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);

    return points.map((point) => {
      const x = point.x * cosAngle - point.z * sinAngle;
      const z = point.x * sinAngle + point.z * cosAngle;

      return {
        x,
        y: point.y,
        z,
      };
    });
  }

  private applyPerspective(point: Point3D, distance: number = 200): Point3D {
    const scale = distance / (distance + point.z);
    return {
      x: point.x * scale,
      y: point.y * scale,
      z: point.z,
    };
  }

  private drawPolygon(canvas: Canvas, points: Point3D[], fill: boolean = true) {
    const ctx = canvas.getCtx();
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    if (fill) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }

  private applyShading(color: string, rotationAngle: number): string {
    const shade = Math.cos(rotationAngle) * 0.3 + 0.7; // Value between 0.4 and 1
    const rgb = parseInt(color.slice(1), 16);
    const r = Math.floor(((rgb >> 16) & 255) * shade);
    const g = Math.floor(((rgb >> 8) & 255) * shade);
    const b = Math.floor((rgb & 255) * shade);
    return `rgb(${r},${g},${b})`;
  }

  private renderShadow(canvas: Canvas) {
    const ctx = canvas.getCtx();
    const shadowRadius = this.soldier.getWidth() / 2;
    const shadowX = 0;
    const shadowY = this.soldier.getHeight() / 2 + 2; // Slightly below the soldier

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; // Subtle, semi-transparent black
    ctx.beginPath();
    ctx.ellipse(shadowX, shadowY, shadowRadius, shadowRadius / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  render(canvas: Canvas) {
    const ctx = canvas.getCtx();
    ctx.save();

    // Render shadow first
    this.renderShadow(canvas);

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
      const rotatedPoints = this.rotate3D(shape.points, rotationAngle + Math.PI / 2);
      const perspectivePoints = rotatedPoints.map((p) => this.applyPerspective(p));
      const shadedColor = this.applyShading(baseColor, rotationAngle);

      ctx.fillStyle = shadedColor;
      this.drawPolygon(canvas, perspectivePoints);
    }

    ctx.restore();
  }
}

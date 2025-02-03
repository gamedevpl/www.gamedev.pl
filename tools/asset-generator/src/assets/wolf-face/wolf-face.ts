import { CanvasRenderingContext2D } from 'canvas';
import { Asset } from '../assets-types';

// Updated color palette to match reference image
const COLORS = {
  fur: '#2A2A2A',
  furLight: '#3A3A3A',
  cyberPartsBlue: '#00FFFF',
  cyberPartsRed: '#FF0000',
  cyberGlowBlue: 'rgba(0, 255, 255, 0.4)',
  cyberGlowRed: 'rgba(255, 0, 0, 0.4)',
  metal: '#4A4A4A',
  background: '#1A1A1A'
} as const;

// Refined configuration for pixel-art style
const CONFIG = {
  pixelSize: 2,
  scale: 1,
  eyeSize: 12,
  snoutWidth: 30,
  snoutHeight: 20,
  earHeight: 40,
  glowStrength: 8,
  faceWidth: 60,
  faceHeight: 50,
  circuitDotSize: 3
} as const;

// Type definitions
type Point = { readonly x: number; readonly y: number };
type DrawFunction = (ctx: CanvasRenderingContext2D, center: Point) => void;
type Circuit = readonly [number, number, number, number];

// Utility function to align to pixel grid
const alignToPixel = (value: number): number => 
  Math.round(value / CONFIG.pixelSize) * CONFIG.pixelSize;

// Utility function to create pixelated line
const drawPixelLine = (
  ctx: CanvasRenderingContext2D, 
  x1: number, 
  y1: number, 
  x2: number, 
  y2: number
): void => {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? CONFIG.pixelSize : -CONFIG.pixelSize;
  const sy = y1 < y2 ? CONFIG.pixelSize : -CONFIG.pixelSize;
  let err = dx - dy;

  while (true) {
    ctx.fillRect(
      alignToPixel(x1),
      alignToPixel(y1),
      CONFIG.pixelSize,
      CONFIG.pixelSize
    );

    if (x1 === x2 && y1 === y2) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x1 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y1 += sy;
    }
  }
};

export const WolfFace: Asset = {
  name: 'wolf-face',
  referenceImage: 'wolf-face-reference.png',
  description: 'Cybernetic wolf face',

  render(ctx: CanvasRenderingContext2D): void {
    const center: Point = {
      x: alignToPixel(ctx.canvas.width / 2),
      y: alignToPixel(ctx.canvas.height / 2)
    };

    ctx.save();

    try {
      // Draw pixelated face shape
      const drawFace: DrawFunction = (ctx, { x, y }) => {
        const points: Point[] = [
          { x: x - CONFIG.faceWidth, y: y - CONFIG.faceHeight + 10 },
          { x: x, y: y - CONFIG.faceHeight - 5 },
          { x: x + CONFIG.faceWidth, y: y - CONFIG.faceHeight + 10 },
          { x: x + CONFIG.faceWidth - 5, y: y + CONFIG.faceHeight - 10 },
          { x: x, y: y + CONFIG.faceHeight },
          { x: x - CONFIG.faceWidth + 5, y: y + CONFIG.faceHeight - 10 }
        ];

        ctx.fillStyle = COLORS.fur;
        ctx.beginPath();
        ctx.moveTo(alignToPixel(points[0].x), alignToPixel(points[0].y));
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(alignToPixel(points[i].x), alignToPixel(points[i].y));
        }
        ctx.closePath();
        ctx.fill();

        // Pixelated fur texture
        ctx.fillStyle = COLORS.furLight;
        for (let i = -CONFIG.faceWidth; i < CONFIG.faceWidth; i += CONFIG.pixelSize * 2) {
          for (let j = -CONFIG.faceHeight; j < CONFIG.faceHeight; j += CONFIG.pixelSize * 2) {
            if (Math.random() > 0.8) {
              ctx.fillRect(
                alignToPixel(x + i),
                alignToPixel(y + j),
                CONFIG.pixelSize,
                CONFIG.pixelSize
              );
            }
          }
        }
      };

      // Draw pixelated ears
      const drawEar = (x: number, mirror: number): void => {
        const baseX = alignToPixel(x + (mirror > 0 ? -5 : 5));
        ctx.fillStyle = COLORS.metal;
        
        const earPoints: Point[] = [
          { x: baseX, y: center.y - 35 },
          { x: baseX + 20 * mirror, y: center.y - CONFIG.earHeight },
          { x: baseX + 35 * mirror, y: center.y - 20 }
        ];

        ctx.beginPath();
        ctx.moveTo(earPoints[0].x, earPoints[0].y);
        earPoints.forEach(point => {
          ctx.lineTo(alignToPixel(point.x), alignToPixel(point.y));
        });
        ctx.closePath();
        ctx.fill();

        // Pixelated ear circuits
        const circuitColor = mirror > 0 ? COLORS.cyberPartsBlue : COLORS.cyberPartsRed;
        ctx.fillStyle = circuitColor;
        [
          [5, -40, 15, -CONFIG.earHeight + 8],
          [10, -35, 20, -CONFIG.earHeight + 12],
          [15, -30, 25, -CONFIG.earHeight + 16]
        ].forEach(([x1, y1, x2, y2]) => {
          drawPixelLine(
            ctx,
            baseX + x1 * mirror,
            center.y + y1,
            baseX + x2 * mirror,
            center.y + y2
          );
        });
      };

      // Draw pixelated eyes
      const drawEye = (x: number, isLeft: boolean): void => {
        const eyeColor = isLeft ? COLORS.cyberPartsBlue : COLORS.cyberPartsRed;
        const glowColor = isLeft ? COLORS.cyberGlowBlue : COLORS.cyberGlowRed;

        // Eye socket
        ctx.fillStyle = COLORS.metal;
        for (let i = -CONFIG.eyeSize; i < CONFIG.eyeSize; i += CONFIG.pixelSize) {
          for (let j = -CONFIG.eyeSize; j < CONFIG.eyeSize; j += CONFIG.pixelSize) {
            if (i * i + j * j <= CONFIG.eyeSize * CONFIG.eyeSize) {
              ctx.fillRect(
                alignToPixel(x + i),
                alignToPixel(center.y - 10 + j),
                CONFIG.pixelSize,
                CONFIG.pixelSize
              );
            }
          }
        }

        // Eye core with glow
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = CONFIG.glowStrength;
        ctx.fillStyle = eyeColor;
        for (let i = -CONFIG.eyeSize + 4; i < CONFIG.eyeSize - 4; i += CONFIG.pixelSize) {
          for (let j = -CONFIG.eyeSize + 4; j < CONFIG.eyeSize - 4; j += CONFIG.pixelSize) {
            if (i * i + j * j <= (CONFIG.eyeSize - 4) * (CONFIG.eyeSize - 4)) {
              ctx.fillRect(
                alignToPixel(x + i),
                alignToPixel(center.y - 10 + j),
                CONFIG.pixelSize,
                CONFIG.pixelSize
              );
            }
          }
        }
        ctx.shadowBlur = 0;
      };

      // Draw components
      drawFace(ctx, center);
      drawEar(center.x - 55, 1);
      drawEar(center.x + 55, -1);
      drawEye(center.x - 25, true);
      drawEye(center.x + 25, false);

      // Pixelated nose
      ctx.fillStyle = COLORS.metal;
      for (let i = -5; i < 5; i += CONFIG.pixelSize) {
        for (let j = -5; j < 5; j += CONFIG.pixelSize) {
          if (i * i + j * j <= 25) {
            ctx.fillRect(
              alignToPixel(center.x + i),
              alignToPixel(center.y + 15 + j),
              CONFIG.pixelSize,
              CONFIG.pixelSize
            );
          }
        }
      }

      // Draw pixelated circuits and dots
      const drawCircuits = (): void => {
        const circuits: Circuit[] = [
          [center.x - 60, center.y - 20, center.x - 35, center.y - 25],
          [center.x + 60, center.y - 20, center.x + 35, center.y - 25],
          [center.x - 20, center.y + 25, center.x + 20, center.y + 25],
          [center.x - 40, center.y + 15, center.x - 20, center.y + 20],
          [center.x + 40, center.y + 15, center.x + 20, center.y + 20]
        ];

        // Draw circuit lines
        ctx.shadowColor = COLORS.cyberGlowBlue;
        ctx.shadowBlur = CONFIG.glowStrength;
        circuits.forEach(([x1, y1, x2, y2], index) => {
          ctx.fillStyle = index < 2 ? COLORS.cyberPartsRed : COLORS.cyberPartsBlue;
          drawPixelLine(ctx, x1, y1, x2, y2);
        });

        // Add circuit dots
        const dots: Point[] = [
          { x: center.x - 50, y: center.y - 30 },
          { x: center.x + 50, y: center.y - 30 },
          { x: center.x - 30, y: center.y + 30 },
          { x: center.x + 30, y: center.y + 30 }
        ];

        dots.forEach((dot, index) => {
          ctx.fillStyle = index < 2 ? COLORS.cyberPartsRed : COLORS.cyberPartsBlue;
          ctx.fillRect(
            alignToPixel(dot.x - CONFIG.circuitDotSize / 2),
            alignToPixel(dot.y - CONFIG.circuitDotSize / 2),
            CONFIG.circuitDotSize,
            CONFIG.circuitDotSize
          );
        });
      };

      drawCircuits();
    } finally {
      ctx.restore();
    }
  },
};
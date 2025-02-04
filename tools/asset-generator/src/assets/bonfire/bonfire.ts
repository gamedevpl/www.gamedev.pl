import { CanvasRenderingContext2D } from 'canvas';
import { Asset } from '../assets-types';

interface FlameParticle {
  x: number;
  y: number;
  size: number;
  angle: number;
  speed: number;
  life: number;
}

interface WoodGrain {
  offset: number;
  width: number;
  curve: number;
}

// Constants for visual and performance optimization
const GLOW_INTENSITY = 0.12;
const FLAME_COUNT = 8;
const EMBER_COUNT = 15;
const BASE_FLAME_HEIGHT = 50;
const INNER_GLOW_RADIUS = 12;
const OUTER_GLOW_RADIUS = 70;

// Cached color values
const LOG_COLORS = {
  base: '#2a1810',
  stroke: '#1a0f0a',
  grain: '#3a2718'
};

const FLAME_COLORS = {
  base: 'rgba(255, 55, 0, 0.95)',
  middle: 'rgba(255, 143, 0, 0.9)',
  top: 'rgba(255, 235, 0, 0.8)',
  tip: 'rgba(255, 245, 180, 0.6)'
};

export const Bonfire: Asset = {
  name: 'bonfire',
  description: 'A warm and cozy bonfire, perfect for a night of camping.',
  render(ctx: CanvasRenderingContext2D) {
    const centerX = ctx.canvas.width / 2;
    const baseY = ctx.canvas.height * 0.7;
    const timestamp = performance.now() / 1000;

    const drawLog = (x: number, y: number, width: number, angle: number): void => {
      const grainCount = Math.floor(width / 8); // Increased grain density
      const grains: WoodGrain[] = new Array(grainCount);
      
      // Pre-calculate grains for better performance
      for (let i = 0; i < grainCount; i++) {
        grains[i] = {
          offset: (i * width) / grainCount - width / 2 + Math.random() * 5,
          width: 1.5 + Math.random(), // Increased grain width
          curve: Math.random() * 0.4 - 0.2 // Enhanced curve variation
        };
      }

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      // Sharp-edged log shape
      ctx.fillStyle = LOG_COLORS.base;
      ctx.strokeStyle = LOG_COLORS.stroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-width / 2, -12);
      ctx.lineTo(width / 2, -12);
      ctx.lineTo(width / 2, 12);
      ctx.lineTo(-width / 2, 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Enhanced wood grain texture
      ctx.strokeStyle = LOG_COLORS.grain;
      for (const grain of grains) {
        ctx.beginPath();
        ctx.moveTo(grain.offset, -10);
        ctx.bezierCurveTo(
          grain.offset + grain.curve * 12,
          -5,
          grain.offset - grain.curve * 12,
          5,
          grain.offset,
          10
        );
        ctx.lineWidth = grain.width;
        ctx.stroke();
      }

      ctx.restore();
    };

    const drawEmbers = (): void => {
      for (let i = 0; i < EMBER_COUNT; i++) {
        const angle = (Math.PI * 2 * i) / EMBER_COUNT + Math.sin(timestamp + i) * 0.3;
        const distance = 12 + Math.cos(timestamp * 2 + i) * 6;
        const x = centerX + Math.cos(angle) * distance;
        const y = baseY - 25 + Math.sin(angle) * distance;
        const size = 1 + Math.random() * 2;
        const redValue = 200 + Math.floor(Math.random() * 55);
        const opacity = 0.5 + Math.sin(timestamp * 3 + i) * 0.4;

        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${redValue}, ${50 + Math.random() * 30}, 20, ${opacity})`;
        ctx.fill();
      }
    };

    const drawFlames = (): void => {
      for (let i = 0; i < FLAME_COUNT; i++) {
        const phase = timestamp * 1.5 + i * (Math.PI / FLAME_COUNT);
        const flameX = centerX + Math.sin(phase * 2) * 8;
        const flameHeight = BASE_FLAME_HEIGHT + Math.sin(phase * 3) * 15;
        const width = 14 + Math.sin(phase) * 6;

        ctx.beginPath();
        ctx.moveTo(flameX - width, baseY - 20);

        // Dynamic control points for more natural movement
        const cp1x = flameX + Math.sin(phase * 3) * 15;
        const cp1y = baseY - 40 - flameHeight * 0.5;
        const cp2x = flameX + Math.cos(phase * 2) * 10;
        const cp2y = baseY - flameHeight - 25;
        const cp3x = flameX - Math.sin(phase * 2.5) * 15;
        const cp3y = baseY - 40 - flameHeight * 0.7;

        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, flameX, baseY - flameHeight - 30);
        ctx.bezierCurveTo(cp3x, cp3y, flameX + width * 0.9, baseY - 35, flameX + width, baseY - 20);

        const gradient = ctx.createLinearGradient(flameX, baseY - 20, flameX, baseY - flameHeight - 30);
        gradient.addColorStop(0, FLAME_COLORS.base);
        gradient.addColorStop(0.4, FLAME_COLORS.middle);
        gradient.addColorStop(0.7, FLAME_COLORS.top);
        gradient.addColorStop(1, FLAME_COLORS.tip);

        ctx.fillStyle = gradient;
        ctx.fill();
      }
    };

    const drawGlow = (): void => {
      const gradient = ctx.createRadialGradient(
        centerX, baseY - 30, INNER_GLOW_RADIUS,
        centerX, baseY - 30, OUTER_GLOW_RADIUS
      );

      gradient.addColorStop(0, `rgba(255, 120, 30, ${GLOW_INTENSITY})`);
      gradient.addColorStop(0.6, `rgba(255, 80, 10, ${GLOW_INTENSITY * 0.4})`);
      gradient.addColorStop(1, 'rgba(255, 60, 0, 0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, baseY - 30, OUTER_GLOW_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    };

    // Render layers in correct order
    drawGlow();
    
    // Draw logs in triangular arrangement with adjusted angles
    drawLog(centerX - 22, baseY, 85, -Math.PI / 5);
    drawLog(centerX + 22, baseY, 85, Math.PI / 5);
    drawLog(centerX, baseY - 18, 75, 0);

    drawEmbers();
    drawFlames();
  },
};
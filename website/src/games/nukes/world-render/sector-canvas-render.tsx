import React, { useEffect, useRef, useState } from 'react';
import { Rect, Sector, SectorType } from '../world/world-state-types';
import { useObjectPointer } from '../controls/pointer';
import { useCustomEvent } from '../events';
import { CITY_SECTOR_POPULATION } from '../world/world-state-constants';

interface SectorCanvasProps {
  sectors: Sector[];
}

// Memoized component to avoid unnecessary re-renders
const SectorCanvas: React.FC<SectorCanvasProps> = React.memo(({ sectors }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [point, unpoint] = useObjectPointer();
  const [renderTrigger, setRenderTrigger] = useState(0);

  useCustomEvent('cityDamage', () => {
    setRenderTrigger(renderTrigger + 1);
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Calculate the canvas size
    const minX = Math.min(...sectors.map((s) => s.rect.left));
    const minY = Math.min(...sectors.map((s) => s.rect.top));
    const maxX = Math.max(...sectors.map((s) => s.rect.right));
    const maxY = Math.max(...sectors.map((s) => s.rect.bottom));

    const width = maxX - minX;
    const height = maxY - minY;

    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // Find the maximum depth and height
    const maxDepth = Math.max(...sectors.filter((s) => s.type === SectorType.WATER).map((s) => s.depth || 0));
    const maxHeight = Math.max(...sectors.filter((s) => s.type === SectorType.GROUND).map((s) => s.height || 0));

    // Draw the sectors
    ctx.clearRect(0, 0, width, height);
    sectors.forEach((sector) => {
      const { fillStyle, drawSector } = getRenderFunction(sector, maxDepth, maxHeight);

      // Fill with the appropriate color or gradient
      ctx.fillStyle = fillStyle;
      drawSector(ctx, sector.rect, minX, minY);
    });
  }, [sectors, renderTrigger]);

  useEffect(() => {
    const canvas = canvasRef.current;
    let previousPointedSector: Sector;
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas?.getBoundingClientRect();
      const x = e.clientX - (rect?.left || 0);
      const y = e.clientY - (rect?.top || 0);

      const pointedSector = sectors.find(
        (sector) => x >= sector.rect.left && x <= sector.rect.right && y >= sector.rect.top && y <= sector.rect.bottom,
      );

      if (pointedSector) {
        if (previousPointedSector) {
          unpoint(previousPointedSector);
        }
        // Trigger point event
        point(pointedSector);
        previousPointedSector = pointedSector;
      }
    };

    canvas?.addEventListener('mousemove', handleMouseMove);
    return () => {
      canvas?.removeEventListener('mousemove', handleMouseMove);
    };
  }, [sectors, point, unpoint]);

  return <canvas ref={canvasRef}></canvas>;
});

function getRenderFunction(sector: Sector, maxDepth: number, maxHeight: number) {
  switch (sector.type) {
    case SectorType.GROUND:
      if (sector.cityId) {
        return {
          fillStyle: getCityColor(sector),
          drawSector: (ctx: CanvasRenderingContext2D, rect: Rect, minX: number, minY: number) => {
            ctx.fillStyle = getCityColor(sector);
            ctx.fillRect(rect.left - minX, rect.top - minY, rect.right - rect.left, rect.bottom - rect.top);
            if (sector.population! > 0) {
              drawCityFeatures(ctx, rect, minX, minY);
            }
          },
        };
      }

      return {
        fillStyle: getGroundColor(sector.height || 0, maxHeight),
        drawSector: (ctx: CanvasRenderingContext2D, rect: Rect, minX: number, minY: number) => {
          ctx.fillStyle = getGroundColor(sector.height || 0, maxHeight);
          ctx.fillRect(rect.left - minX, rect.top - minY, rect.right - rect.left, rect.bottom - rect.top);
        },
      };
    case SectorType.WATER:
      return {
        fillStyle: 'rgb(0, 34, 93)',
        drawSector: (ctx: CanvasRenderingContext2D, rect: Rect, minX: number, minY: number) => {
          const depthRatio = (sector.depth || 0) / maxDepth;
          const r = Math.round(0 + (34 - 0) * (1 - depthRatio));
          const g = Math.round(137 + (34 - 137) * depthRatio);
          const b = Math.round(178 + (93 - 178) * depthRatio);
          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
          ctx.fillRect(rect.left - minX, rect.top - minY, rect.right - rect.left, rect.bottom - rect.top);
        },
      };
    default:
      return {
        fillStyle: 'rgb(0, 34, 93)', // Default to water color
        drawSector: (ctx: CanvasRenderingContext2D, rect: Rect, minX: number, minY: number) => {
          ctx.fillStyle = 'rgb(0, 34, 93)'; // Default color
          ctx.fillRect(rect.left - minX, rect.top - minY, rect.right - rect.left, rect.bottom - rect.top);
        },
      };
  }
}

function getCityColor(sector: Sector): string {
  if (sector.population! === 0) {
    return 'rgba(0,0,0,0.7)';
  }

  // Example logic to derive color based on population and height
  const populationFactor = sector.population ? Math.min(sector.population / CITY_SECTOR_POPULATION, 1) : 0;
  const heightFactor = sector.height ? sector.height / 100 : 0;
  const baseColor = [200, 200, 200]; // Base grey color
  const color = baseColor.map((v) => v - 50 * populationFactor + 20 * heightFactor);
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}

function drawCityFeatures(ctx: CanvasRenderingContext2D, rect: Rect, minX: number, minY: number) {
  // Example drawing logic for city features
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; // Shadow color
  ctx.fillRect(rect.left - minX + 2, rect.top - minY + 2, rect.right - rect.left - 4, rect.bottom - rect.top - 4);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'; // Light color
  ctx.fillRect(rect.left - minX + 4, rect.top - minY + 4, rect.right - rect.left - 8, rect.bottom - rect.top - 8);
}

function getGroundColor(height: number, maxHeight: number): string {
  const heightRatio = height / maxHeight;

  if (heightRatio < 0.2) {
    // Sand/beach (light yellow)
    return `rgb(255, ${Math.round(223 + (187 - 223) * (heightRatio / 0.2))}, 128)`;
  } else if (heightRatio < 0.5) {
    // Grass/forest (from light green to dark green)
    const greenIntensity = Math.round(200 - (200 - 100) * ((heightRatio - 0.2) / 0.3));
    return `rgb(34, ${greenIntensity}, 34)`;
  } else if (heightRatio < 0.95) {
    // Mountains (from dark green to brown)
    const r = Math.round(34 + (101 - 34) * ((heightRatio - 0.5) / 0.3));
    const g = Math.round(100 + (67 - 100) * ((heightRatio - 0.5) / 0.3));
    const b = Math.round(34 + (33 - 34) * ((heightRatio - 0.5) / 0.3));
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Snow (white to light blue for highest peaks)
    const blueIntensity = Math.round(255 - (255 - 200) * ((heightRatio - 0.8) / 0.2));
    return `rgb(255, 255, ${blueIntensity})`;
  }
}

export default SectorCanvas;

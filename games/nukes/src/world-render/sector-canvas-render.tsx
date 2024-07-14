import React, { useEffect, useRef } from 'react';
import { Sector } from '../world/world-state-types';
import { useObjectPointer } from '../controls/pointer';

interface SectorCanvasProps {
  sectors: Sector[];
}

// Memoized component to avoid unnecessary re-renders
const SectorCanvas: React.FC<SectorCanvasProps> = React.memo(({ sectors }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [point, unpoint] = useObjectPointer();

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

    // Draw the sectors
    ctx.clearRect(0, 0, width, height);
    sectors.forEach((sector) => {
      ctx.fillStyle = sector.type === 'GROUND' ? 'rgb(93, 42, 0)' : 'rgb(0, 34, 93)';
      ctx.fillRect(
        sector.rect.left - minX,
        sector.rect.top - minY,
        sector.rect.right - sector.rect.left,
        sector.rect.bottom - sector.rect.top,
      );
    });
  }, [sectors]);

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
  }, [sectors]);

  return <canvas ref={canvasRef}></canvas>;
});

export default SectorCanvas;

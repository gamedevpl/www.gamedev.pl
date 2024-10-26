import React, { useRef, useEffect, useState } from 'react';
import styled from 'styled-components';
import { Unit } from './designer-types';
import { TerrainData } from '../battle/game/terrain/terrain-generator';
import { GridRenderer } from './components/canvas/grid-renderer';
import { UnitRenderer } from './components/canvas/unit-renderer';
import { TerrainRenderer } from './components/canvas/terrain-renderer';
import { AnimatedBorderRenderer } from './components/canvas/animated-border-renderer';
import { GridInteractionHandler } from './components/canvas/grid-interaction-handler';
import { UNIT_ASSET_PATHS } from '../battle/assets';
import { useRafLoop } from 'react-use';

interface CanvasGridProps {
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  units: Unit[];
  selectedUnitId: number | null;
  onCellClick: (col: number, row: number) => void;
  onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onTouchStart: (e: React.TouchEvent<HTMLCanvasElement>) => void;
  onTouchMove: (e: React.TouchEvent<HTMLCanvasElement>) => void;
  onTouchEnd: (e: React.TouchEvent<HTMLCanvasElement>) => void;
  onModifyUnit: (unitId: number, changes: Partial<Pick<Unit, 'type' | 'sizeCol' | 'sizeRow'>>) => void;
  isPlayerArea: boolean;
  terrainData: TerrainData;
}

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
};

export const CanvasGrid: React.FC<CanvasGridProps> = React.memo(
  ({
    width,
    height,
    cellWidth,
    cellHeight,
    units,
    selectedUnitId,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onCellClick,
    isPlayerArea,
    terrainData,
  }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [unitImages, setUnitImages] = useState<Record<string, HTMLImageElement>>({});

    useEffect(() => {
      const loadUnitImages = async () => {
        const loadedImages: Record<string, HTMLImageElement> = {};
        for (const [unitType, imagePath] of Object.entries(UNIT_ASSET_PATHS)) {
          try {
            loadedImages[unitType] = await loadImage(imagePath);
          } catch (error) {
            console.error(`Failed to load image for ${unitType}:`, error);
          }
        }
        setUnitImages(loadedImages);
      };

      loadUnitImages();
    }, []);

    useRafLoop(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear the canvas
      ctx.clearRect(0, 0, width, height);

      // Render layers
      TerrainRenderer.render(ctx, { width, height, cellWidth, cellHeight, terrainData, isPlayerArea });
      GridRenderer.render(ctx, { width, height, cellWidth, cellHeight });
      UnitRenderer.render(ctx, {
        units,
        unitImages,
        cellWidth,
        cellHeight,
        isPlayerArea,
      });

      if (isPlayerArea) {
        AnimatedBorderRenderer.render(ctx, {
          units,
          selectedUnitId,
          cellWidth,
          cellHeight,
          timestamp: Date.now(),
        });
      }
    });

    return (
      <CanvasContainer
        ref={canvasRef}
        data-is-player-area={isPlayerArea}
        width={width}
        height={height}
        {...GridInteractionHandler.getEventHandlers({
          canvasRef,
          cellWidth,
          cellHeight,
          isPlayerArea,
          onCellClick,
          onMouseDown,
          onMouseMove,
          onMouseUp,
          onTouchStart,
          onTouchMove,
          onTouchEnd,
        })}
      />
    );
  },
);

CanvasGrid.displayName = 'CanvasGrid';

const CanvasContainer = styled.canvas`
  position: fixed;
  &[data-is-player-area='false'] {
    transform: translateX(-50%);
    bottom: 50%;
  }
  &[data-is-player-area='true'] {
    transform: translateX(-50%);
    top: 50%;
  }
  left: 50%;
  max-width: 100%;
  max-height: 50%;
`;

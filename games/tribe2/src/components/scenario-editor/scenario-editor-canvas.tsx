/**
 * Canvas component for the Scenario Editor.
 * Handles rendering of the scenario world preview.
 */
import React, { useEffect } from 'react';
import { ScenarioConfig, EditorTool } from '../../game/scenario-editor/scenario-types';
import { Vector2D } from '../../game/utils/math-types';
import { CHILD_TO_ADULT_AGE } from '../../game/human-consts';
import * as S from './scenario-editor-styles';

interface ScenarioEditorCanvasProps {
  config: ScenarioConfig;
  viewportCenter: Vector2D;
  zoom: number;
  selectedTool: EditorTool;
  selectedTribeId: string | null;
  worldPos: Vector2D;
  onCanvasClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp: () => void;
  onWheel: (e: React.WheelEvent<HTMLCanvasElement>) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  canvasRef: React.RefObject<HTMLCanvasElement>;
}

export const ScenarioEditorCanvas: React.FC<ScenarioEditorCanvasProps> = ({
  config,
  viewportCenter,
  zoom,
  selectedTool,
  selectedTribeId,
  worldPos,
  onCanvasClick,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onWheel,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  canvasRef,
}) => {
  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      canvas.width = canvas.parentElement?.clientWidth || 800;
      canvas.height = canvas.parentElement?.clientHeight || 600;

      // Clear canvas
      ctx.fillStyle = '#2c5234';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();

      // Apply viewport transform
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-viewportCenter.x, -viewportCenter.y);

      // Draw map boundary
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 / zoom;
      ctx.strokeRect(0, 0, config.mapWidth, config.mapHeight);

      // Draw grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1 / zoom;
      const gridSize = 100;
      for (let x = 0; x <= config.mapWidth; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, config.mapHeight);
        ctx.stroke();
      }
      for (let y = 0; y <= config.mapHeight; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(config.mapWidth, y);
        ctx.stroke();
      }

      // Draw berry bushes
      ctx.fillStyle = '#228B22';
      for (const bush of config.berryBushes) {
        ctx.beginPath();
        ctx.arc(bush.position.x, bush.position.y, 15, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw prey
      ctx.fillStyle = '#FFD700';
      for (const p of config.prey) {
        ctx.beginPath();
        ctx.arc(p.position.x, p.position.y, 10, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw predators
      ctx.fillStyle = '#8B0000';
      for (const pred of config.predators) {
        ctx.beginPath();
        ctx.arc(pred.position.x, pred.position.y, 12, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw buildings
      for (const building of config.buildings) {
        ctx.fillStyle =
          building.type === 'storageSpot' ? '#8B4513' : building.type === 'plantingZone' ? '#556B2F' : '#4169E1';
        ctx.fillRect(building.position.x - 20, building.position.y - 20, 40, 40);
      }

      // Draw tribes and humans
      for (const tribe of config.tribes) {
        // Draw tribe center marker
        ctx.font = `${24 / zoom}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tribe.badge, tribe.position.x, tribe.position.y);

        // Highlight selected tribe
        if (tribe.id === selectedTribeId) {
          ctx.strokeStyle = '#e94560';
          ctx.lineWidth = 3 / zoom;
          ctx.beginPath();
          ctx.arc(tribe.position.x, tribe.position.y, 30, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Draw humans
        for (const human of tribe.humans) {
          ctx.fillStyle = human.isPlayer
            ? '#00FF00'
            : human.isLeader
              ? '#FFD700'
              : human.gender === 'male'
                ? '#4169E1'
                : '#FF69B4';
          ctx.beginPath();
          ctx.arc(human.position.x, human.position.y, human.age >= CHILD_TO_ADULT_AGE ? 12 : 8, 0, Math.PI * 2);
          ctx.fill();

          // Draw badge above human
          ctx.font = `${12 / zoom}px Arial`;
          ctx.fillText(tribe.badge, human.position.x, human.position.y - 20);
        }
      }

      // Draw player start position
      if (config.playerStartPosition) {
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 3 / zoom;
        ctx.beginPath();
        ctx.moveTo(config.playerStartPosition.x - 20, config.playerStartPosition.y - 20);
        ctx.lineTo(config.playerStartPosition.x + 20, config.playerStartPosition.y + 20);
        ctx.moveTo(config.playerStartPosition.x + 20, config.playerStartPosition.y - 20);
        ctx.lineTo(config.playerStartPosition.x - 20, config.playerStartPosition.y + 20);
        ctx.stroke();

        ctx.font = `${14 / zoom}px Arial`;
        ctx.fillStyle = '#00FF00';
        ctx.fillText('PLAYER START', config.playerStartPosition.x, config.playerStartPosition.y + 35);
      }

      ctx.restore();

      // Draw current tool indicator
      ctx.fillStyle = '#fff';
      ctx.font = '12px "Press Start 2P"';
      ctx.textAlign = 'left';
      ctx.fillText(`Tool: ${selectedTool}`, 10, 30);
    };

    render();
  }, [canvasRef, config, viewportCenter, zoom, selectedTool, selectedTribeId]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = canvas.parentElement?.clientWidth || 800;
        canvas.height = canvas.parentElement?.clientHeight || 600;
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, [canvasRef]);

  return (
    <S.CanvasContainer>
      <S.StyledCanvas
        ref={canvasRef}
        onClick={onCanvasClick}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      />
      <S.CoordinateDisplay>
        World: ({Math.round(worldPos.x)}, {Math.round(worldPos.y)}) | Zoom: {(zoom * 100).toFixed(0)}%
      </S.CoordinateDisplay>
      <S.ZoomControls>
        <S.ZoomButton onClick={onZoomIn}>+</S.ZoomButton>
        <S.ZoomButton onClick={onZoomOut}>-</S.ZoomButton>
        <S.ZoomButton onClick={onZoomReset}>1:1</S.ZoomButton>
      </S.ZoomControls>
    </S.CanvasContainer>
  );
};

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useGameContext } from '../../context/game-context';
import { BuildingEntity } from '../../game/entities/buildings/building-types';
import { BuildingType, BUILDING_DEFINITIONS, BORDER_EXPANSION_PAINT_RADIUS } from '../../game/entities/buildings/building-consts';
import { renderBuilding, renderGhostBuilding } from '../../game/render/render-building';
import { IndexedWorldState } from '../../game/world-index/world-index-types';
import { calculateWrappedDistanceSq } from '../../game/utils/math-utils';
import { NAV_GRID_RESOLUTION } from '../../game/utils/navigation-utils';
import { GameWorldState } from '../../game/world-types';
import { paintTerrainOwnership } from '../../game/entities/tribe/territory-utils';
import { renderAllTerritories } from '../../game/render/render-territory';
import { TERRITORY_OWNERSHIP_RESOLUTION, TERRITORY_BUILDING_RADIUS } from '../../game/entities/tribe/territory-consts';
import { canPlaceBuilding, findAdjacentBuildingPlacement } from '../../game/utils/building-placement-utils';
import { GORD_DEFAULT_GATE_SPACING, GORD_MIN_GATE_DISTANCE_PX } from '../../game/ai/task/tribes/gord-boundary-utils';

import { PlannedGordPosition, GordPlanStats } from './types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, DEFAULT_GORD_SAFE_RADIUS } from './constants';
import {
  ScreenContainer,
  Sidebar,
  CanvasContainer,
  Canvas,
  Title,
  SectionTitle,
  Button,
  BackButton,
  CheckboxLabel,
  InfoText,
  QualityBadge,
} from './styled-components';
import { createMockWorldState, planGordPerimeter, calculateGordStats, createBuildingEntity } from './utils';

export const PalisadePlacementScreen: React.FC = () => {
  const { returnToIntro } = useGameContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();

  const [selectedType, setSelectedType] = useState<BuildingType>(BuildingType.Bonfire);
  const [placedBuildings, setPlacedBuildings] = useState<BuildingEntity[]>([]);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [nextBuildingId, setNextBuildingId] = useState(10);
  const [showTerritoryGrid, setShowTerritoryGrid] = useState(true);
  const [showNavGrid, setShowNavGrid] = useState(false);
  const [showValidPlacement] = useState(true);
  const [showPlannedGord, setShowPlannedGord] = useState(true);
  const [gordSafeRadius, setGordSafeRadius] = useState(DEFAULT_GORD_SAFE_RADIUS);
  const [gateSpacing] = useState(GORD_DEFAULT_GATE_SPACING);
  const [plannedGordPositions, setPlannedGordPositions] = useState<PlannedGordPosition[]>([]);

  const [terrainOwnership, setTerrainOwnership] = useState<(number | null)[]>(
    new Array(
      Math.ceil(CANVAS_WIDTH / TERRITORY_OWNERSHIP_RESOLUTION) *
        Math.ceil(CANVAS_HEIGHT / TERRITORY_OWNERSHIP_RESOLUTION),
    ).fill(null),
  );

  const hubBuildings = useMemo(() => {
    return placedBuildings.filter(
      (b) => b.buildingType === BuildingType.Bonfire || b.buildingType === BuildingType.StorageSpot,
    );
  }, [placedBuildings]);

  const gordStats = useMemo((): GordPlanStats | null => {
    if (plannedGordPositions.length === 0) return null;
    return calculateGordStats(plannedGordPositions, hubBuildings, gordSafeRadius);
  }, [plannedGordPositions, hubBuildings, gordSafeRadius]);

  const snapToGrid = useCallback((x: number, y: number): { x: number; y: number } => {
    const gridSize = NAV_GRID_RESOLUTION;
    return { x: Math.round(x / gridSize) * gridSize, y: Math.round(y / gridSize) * gridSize };
  }, []);

  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const snappedPos = snapToGrid(x, y);
      const mockState = createMockWorldState(placedBuildings, terrainOwnership);

      if (!canPlaceBuilding(snappedPos, selectedType, 1, mockState)) return;

      const newBuilding = createBuildingEntity(nextBuildingId, selectedType, snappedPos, 1);
      const tempOwnership = [...terrainOwnership];
      const tempState = {
        mapDimensions: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
        terrainOwnership: tempOwnership,
      } as GameWorldState;
      const radius =
        selectedType === BuildingType.BorderPost ? BORDER_EXPANSION_PAINT_RADIUS : TERRITORY_BUILDING_RADIUS;

      paintTerrainOwnership(snappedPos, radius, 1, tempState);
      setTerrainOwnership(tempOwnership);

      if (selectedType !== BuildingType.BorderPost) {
        setPlacedBuildings((prev) => [...prev, newBuilding]);
      }
      setNextBuildingId((prev) => prev + 1);
    },
    [selectedType, nextBuildingId, snapToGrid, placedBuildings, terrainOwnership],
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      setMousePos(snapToGrid(x, y));
    },
    [snapToGrid],
  );

  const clearBuildings = useCallback(() => {
    setPlacedBuildings([]);
    setPlannedGordPositions([]);
    setNextBuildingId(10);
    setTerrainOwnership(new Array(terrainOwnership.length).fill(null));
  }, [terrainOwnership.length]);

  const planGord = useCallback(() => {
    if (hubBuildings.length === 0) {
      setPlannedGordPositions([]);
      return;
    }
    const allPositions = planGordPerimeter(hubBuildings, placedBuildings, gordSafeRadius, terrainOwnership);
    setPlannedGordPositions(allPositions);
  }, [hubBuildings, placedBuildings, gordSafeRadius, gateSpacing, terrainOwnership]);

  const executeGordPlan = useCallback(() => {
    if (plannedGordPositions.length === 0) return;
    const newBuildings: BuildingEntity[] = [];
    let currentId = nextBuildingId;
    const tempOwnership = [...terrainOwnership];
    const tempState = {
      mapDimensions: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
      terrainOwnership: tempOwnership,
    } as GameWorldState;

    for (const planned of plannedGordPositions) {
      const buildingType = planned.isGate ? BuildingType.Gate : BuildingType.Palisade;
      const newBuilding = createBuildingEntity(currentId++, buildingType, planned.position, 1);
      newBuildings.push(newBuilding);
      paintTerrainOwnership(planned.position, TERRITORY_BUILDING_RADIUS, 1, tempState);
    }

    setTerrainOwnership(tempOwnership);
    setPlacedBuildings((prev) => [...prev, ...newBuildings]);
    setNextBuildingId(currentId);
    setPlannedGordPositions([]);
  }, [plannedGordPositions, nextBuildingId, terrainOwnership]);

  const autoPlaceSingleBuilding = useCallback(() => {
    const mockState = createMockWorldState(placedBuildings, terrainOwnership);
    const humanPos = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
    const position = findAdjacentBuildingPlacement(selectedType, 1, mockState, 200, 100, humanPos);

    if (position) {
      const newBuilding = createBuildingEntity(nextBuildingId, selectedType, position, 1);
      const tempOwnership = [...terrainOwnership];
      const tempState = {
        mapDimensions: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
        terrainOwnership: tempOwnership,
      } as GameWorldState;
      paintTerrainOwnership(position, TERRITORY_BUILDING_RADIUS, 1, tempState);
      setTerrainOwnership(tempOwnership);
      setPlacedBuildings((prev) => [...prev, newBuilding]);
      setNextBuildingId((prev) => prev + 1);
    }
  }, [placedBuildings, terrainOwnership, selectedType, nextBuildingId]);

  useEffect(() => {
    const render = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;
      const viewportCenter = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
      const mockState = createMockWorldState(placedBuildings, terrainOwnership);

      ctx.fillStyle = '#2c5234';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      if (showTerritoryGrid) {
        renderAllTerritories(ctx, mockState, viewportCenter, { width: CANVAS_WIDTH, height: CANVAS_HEIGHT }, 1);
      }

      if (showNavGrid) {
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= CANVAS_WIDTH; x += NAV_GRID_RESOLUTION) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, CANVAS_HEIGHT);
          ctx.stroke();
        }
        for (let y = 0; y <= CANVAS_HEIGHT; y += NAV_GRID_RESOLUTION) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(CANVAS_WIDTH, y);
          ctx.stroke();
        }
      }

      for (const building of placedBuildings) {
        renderBuilding(ctx, building, mockState as unknown as IndexedWorldState);
      }

      if (showPlannedGord && plannedGordPositions.length > 0) {
        ctx.save();
        for (let i = 0; i < plannedGordPositions.length; i++) {
          const planned = plannedGordPositions[i];
          const { x, y } = planned.position;
          const size = NAV_GRID_RESOLUTION;
          if (planned.isGate) {
            ctx.fillStyle = 'rgba(100, 150, 255, 0.7)';
            ctx.strokeStyle = '#4080FF';
          } else {
            ctx.fillStyle = 'rgba(180, 120, 60, 0.7)';
            ctx.strokeStyle = '#8B4513';
          }
          ctx.fillRect(x - size / 2, y - size / 2, size, size);
          ctx.lineWidth = 2;
          ctx.strokeRect(x - size / 2, y - size / 2, size, size);
          if (i < 5 || i === plannedGordPositions.length - 1) {
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '8px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(i + 1), x, y);
          }
        }

        if (plannedGordPositions.length > 1) {
          ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(plannedGordPositions[0].position.x, plannedGordPositions[0].position.y);
          for (let i = 1; i < plannedGordPositions.length; i++) {
            const p1 = plannedGordPositions[i - 1].position;
            const p2 = plannedGordPositions[i].position;
            if (calculateWrappedDistanceSq(p1, p2, CANVAS_WIDTH, CANVAS_HEIGHT) < 100 * 100) {
              ctx.lineTo(p2.x, p2.y);
            } else {
              ctx.moveTo(p2.x, p2.y);
            }
          }
          ctx.stroke();
        }
        ctx.restore();
      }

      if (mousePos) {
        const canPlace = canPlaceBuilding(mousePos, selectedType, 1, mockState);
        const isValid = showValidPlacement ? canPlace : true;
        renderGhostBuilding(ctx, mousePos, selectedType, isValid, { width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
        if (showValidPlacement) {
          ctx.save();
          ctx.font = '12px Arial';
          ctx.fillStyle = canPlace ? '#00FF00' : '#FF0000';
          ctx.fillText(canPlace ? '✓ Valid placement' : '✗ Invalid placement', mousePos.x + 15, mousePos.y - 15);
          ctx.restore();
        }
      }
      requestRef.current = requestAnimationFrame(render);
    };
    requestRef.current = requestAnimationFrame(render);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [
    placedBuildings,
    mousePos,
    selectedType,
    terrainOwnership,
    showTerritoryGrid,
    showNavGrid,
    showValidPlacement,
    showPlannedGord,
    plannedGordPositions,
  ]);

  return (
    <ScreenContainer>
      <Sidebar>
        <Title>Gord Builder Test</Title>
        <SectionTitle>1. Place Hub Buildings</SectionTitle>
        <Button
          onClick={() => setSelectedType(BuildingType.Bonfire)}
          style={{
            backgroundColor: selectedType === BuildingType.Bonfire ? '#666' : '#444',
            borderLeft: selectedType === BuildingType.Bonfire ? '3px solid #FF6600' : 'none',
          }}
        >
          {BUILDING_DEFINITIONS[BuildingType.Bonfire].icon} Bonfire (Hub)
        </Button>
        <Button
          onClick={() => setSelectedType(BuildingType.StorageSpot)}
          style={{
            backgroundColor: selectedType === BuildingType.StorageSpot ? '#666' : '#444',
            borderLeft: selectedType === BuildingType.StorageSpot ? '3px solid #FF6600' : 'none',
          }}
        >
          {BUILDING_DEFINITIONS[BuildingType.StorageSpot].icon} Storage (Hub)
        </Button>
        <SectionTitle>2. Manual Placement</SectionTitle>
        <Button
          onClick={() => setSelectedType(BuildingType.Palisade)}
          style={{
            backgroundColor: selectedType === BuildingType.Palisade ? '#666' : '#444',
            borderLeft: selectedType === BuildingType.Palisade ? '3px solid #4CAF50' : 'none',
          }}
        >
          {BUILDING_DEFINITIONS[BuildingType.Palisade].icon} Palisade
        </Button>
        <Button
          onClick={() => setSelectedType(BuildingType.Gate)}
          style={{
            backgroundColor: selectedType === BuildingType.Gate ? '#666' : '#444',
            borderLeft: selectedType === BuildingType.Gate ? '3px solid #4CAF50' : 'none',
          }}
        >
          {BUILDING_DEFINITIONS[BuildingType.Gate].icon} Gate
        </Button>
        <SectionTitle>3. AI Gord Planning</SectionTitle>
        <InfoText>Safe Radius: {gordSafeRadius}px</InfoText>
        <input
          type="range"
          min="40"
          max="120"
          value={gordSafeRadius}
          onChange={(e) => setGordSafeRadius(Number(e.target.value))}
          style={{ width: '100%', marginBottom: '10px' }}
        />
        <InfoText>Min Gate Dist: {GORD_MIN_GATE_DISTANCE_PX}px</InfoText>
        <Button
          onClick={planGord}
          style={{ backgroundColor: hubBuildings.length > 0 ? '#2a5' : '#555', textAlign: 'center' }}
          disabled={hubBuildings.length === 0}
        >
          🏰 Plan Gord ({hubBuildings.length} hubs)
        </Button>
        <Button
          onClick={executeGordPlan}
          style={{ backgroundColor: plannedGordPositions.length > 0 ? '#25a' : '#555', textAlign: 'center' }}
          disabled={plannedGordPositions.length === 0}
        >
          ✅ Execute Plan ({plannedGordPositions.length})
        </Button>
        <SectionTitle>Gord Statistics</SectionTitle>
        {gordStats ? (
          <>
            <InfoText>
              🎯 Quality: <QualityBadge $rating={gordStats.qualityRating}>{gordStats.qualityRating}</QualityBadge>
            </InfoText>
            <InfoText>
              🏠 Hubs: {gordStats.hubCount} | 🧱 Palis: {gordStats.palisadeCount} | 🚪 Gates: {gordStats.gateCount}
            </InfoText>
            <InfoText>
              📏 Perimeter: {gordStats.perimeterLength}px | 📐 Area: ~{gordStats.enclosedArea}px²
            </InfoText>
            <InfoText>
              ⚔️ Efficiency: {gordStats.defenseEfficiency} | 📦 Compact: {gordStats.compactness}
            </InfoText>
            <InfoText>
              🛡️ Protection: {(gordStats.protectionScore * 100).toFixed(1)}% | 🪵 Cost: {gordStats.woodCost}
            </InfoText>
          </>
        ) : (
          <InfoText>No gord planned. Place hubs first.</InfoText>
        )}
        <SectionTitle>Visualization</SectionTitle>
        <CheckboxLabel>
          <input type="checkbox" checked={showPlannedGord} onChange={(e) => setShowPlannedGord(e.target.checked)} />{' '}
          Show Planned Gord
        </CheckboxLabel>
        <CheckboxLabel>
          <input type="checkbox" checked={showTerritoryGrid} onChange={(e) => setShowTerritoryGrid(e.target.checked)} />{' '}
          Show Territory
        </CheckboxLabel>
        <CheckboxLabel>
          <input type="checkbox" checked={showNavGrid} onChange={(e) => setShowNavGrid(e.target.checked)} /> Show Nav
          Grid
        </CheckboxLabel>
        <SectionTitle>Actions</SectionTitle>
        <Button onClick={autoPlaceSingleBuilding} style={{ backgroundColor: '#357', textAlign: 'center' }}>
          🎯 Auto-Place Single
        </Button>
        <Button onClick={clearBuildings} style={{ backgroundColor: '#a33', textAlign: 'center' }}>
          🗑️ Clear All
        </Button>
        <BackButton onClick={returnToIntro}>Back to Intro</BackButton>
      </Sidebar>
      <CanvasContainer>
        <Canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setMousePos(null)}
        />
        <p style={{ marginTop: '20px', color: '#888', maxWidth: '600px', textAlign: 'center' }}>
          <strong>How to test:</strong> Place hubs (Bonfire/Storage) -&gt; Plan Gord -&gt; Execute Plan.
          <br />
          Multiple hub clusters will create separate gords. Holes are filtered out.
        </p>
      </CanvasContainer>
    </ScreenContainer>
  );
};

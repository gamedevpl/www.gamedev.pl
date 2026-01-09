import { useState, useCallback, useMemo } from 'react';
import { BuildingType, BUILDING_DEFINITIONS } from '../../game/entities/buildings/building-consts';
import { BuildingEntity } from '../../game/entities/buildings/building-types';
import { Vector2D } from '../../game/utils/math-types';
import { GameWorldState } from '../../game/world-types';
import { TERRITORY_OWNERSHIP_RESOLUTION, TERRITORY_BUILDING_RADIUS } from '../../game/entities/tribe/territory-consts';
import { BORDER_EXPANSION_PAINT_RADIUS } from '../../game/entities/buildings/building-consts';
import { NAV_GRID_RESOLUTION } from '../../game/utils/navigation-utils';
import { paintTerrainOwnership } from '../../game/entities/tribe/territory-utils';
import { canPlaceBuilding, findAdjacentBuildingPlacement } from '../../game/utils/building-placement-utils';
import {
  findGordClusters,
  traceGordPerimeter,
  assignGates,
  GORD_GRID_RESOLUTION,
  filterUncoveredEdges,
  analyzeBorderCoverage,
  GORD_UNSURROUNDED_THRESHOLD,
  GORD_MIN_CELLS_FOR_SURROUNDING,
} from '../../game/ai/task/tribes/gord-boundary-utils';
import { GORD_MIN_CELLS } from '../../game/ai-consts';
import { PlannedGordEdge, GordPlanStats } from './types';
import { createMockWorldState, createBuildingEntity } from './mock-state-utils';

/**
 * Calculates statistics and quality metrics for a planned gord.
 */
function calculateGordStats(
  plannedEdges: PlannedGordEdge[],
  totalCells: number,
  hubCount: number,
  coveredEdges: number,
  totalEdges: number,
  shouldPauseExpansion: boolean,
): GordPlanStats {
  const gateCount = plannedEdges.filter((e) => e.isGate).length;
  const perimeterLength = plannedEdges.length * GORD_GRID_RESOLUTION;

  // Interpolation: 100px edge = 5 segments of 20px.
  // A gate edge places 1 gate (60px) and 2 palisades (20px each).
  // A palisade edge places 5 palisades.
  const palisadeCount = plannedEdges.reduce((sum, edge) => {
    return sum + (edge.isGate ? 2 : 5);
  }, 0);

  const enclosedArea = totalCells * GORD_GRID_RESOLUTION * GORD_GRID_RESOLUTION;

  const palisadeWoodCost = BUILDING_DEFINITIONS[BuildingType.Palisade].cost?.wood ?? 1;
  const gateWoodCost = BUILDING_DEFINITIONS[BuildingType.Gate].cost?.wood ?? 3;
  const woodCost = palisadeCount * palisadeWoodCost + gateCount * gateWoodCost;

  const coverageRatio = totalEdges > 0 ? coveredEdges / totalEdges : 0;

  let qualityRating: GordPlanStats['qualityRating'] = 'Fair';
  if (totalCells >= GORD_MIN_CELLS * 2) qualityRating = 'Excellent';
  else if (totalCells >= GORD_MIN_CELLS) qualityRating = 'Good';

  return {
    perimeterLength,
    palisadeCount,
    gateCount,
    hubCount,
    enclosedArea,
    woodCost,
    qualityRating,
    coveredEdges,
    totalEdges,
    coverageRatio,
    shouldPauseExpansion,
  };
}

export const useGordBuilder = (canvasWidth: number, canvasHeight: number) => {
  const [selectedType, setSelectedType] = useState<BuildingType>(BuildingType.Bonfire);
  const [placedBuildings, setPlacedBuildings] = useState<BuildingEntity[]>([]);
  const [mousePos, setMousePos] = useState<Vector2D | null>(null);
  const [nextBuildingId, setNextBuildingId] = useState(10);
  const [showTerritoryGrid, setShowTerritoryGrid] = useState(true);
  const [showGordGrid, setShowGordGrid] = useState(true);
  const [showPlannedGord, setShowPlannedGord] = useState(true);
  const [plannedGordEdges, setPlannedGordEdges] = useState<PlannedGordEdge[]>([]);
  const [totalGordCells, setTotalGordCells] = useState(0);
  const [coverageStats, setCoverageStats] = useState<{ covered: number; total: number; shouldPause: boolean }>({
    covered: 0,
    total: 0,
    shouldPause: false,
  });

  const [terrainOwnership, setTerrainOwnership] = useState<(number | null)[]>(
    new Array(
      Math.ceil(canvasWidth / TERRITORY_OWNERSHIP_RESOLUTION) *
        Math.ceil(canvasHeight / TERRITORY_OWNERSHIP_RESOLUTION),
    ).fill(null),
  );

  const hubBuildings = useMemo(() => {
    return placedBuildings.filter(
      (b) => b.buildingType === BuildingType.Bonfire || b.buildingType === BuildingType.StorageSpot,
    );
  }, [placedBuildings]);

  const gordStats = useMemo((): GordPlanStats | null => {
    if (plannedGordEdges.length === 0 && coverageStats.total === 0) return null;
    return calculateGordStats(
      plannedGordEdges,
      totalGordCells,
      hubBuildings.length,
      coverageStats.covered,
      coverageStats.total,
      coverageStats.shouldPause,
    );
  }, [plannedGordEdges, totalGordCells, hubBuildings.length, coverageStats]);

  const snapToGrid = useCallback((x: number, y: number): Vector2D => {
    const gridSize = NAV_GRID_RESOLUTION;
    return { x: Math.round(x / gridSize) * gridSize, y: Math.round(y / gridSize) * gridSize };
  }, []);

  const handleCanvasClick = useCallback(
    (x: number, y: number) => {
      const snappedPos = snapToGrid(x, y);
      const mockState = createMockWorldState(placedBuildings, terrainOwnership, canvasWidth, canvasHeight);

      if (!canPlaceBuilding(snappedPos, selectedType, 1, mockState)) return;

      const newBuilding = createBuildingEntity(nextBuildingId, selectedType, snappedPos, 1);
      const tempOwnership = [...terrainOwnership];
      const tempState = {
        mapDimensions: { width: canvasWidth, height: canvasHeight },
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
    [selectedType, nextBuildingId, snapToGrid, placedBuildings, terrainOwnership, canvasWidth, canvasHeight],
  );

  const handleMouseMove = useCallback(
    (x: number, y: number) => {
      setMousePos(snapToGrid(x, y));
    },
    [snapToGrid],
  );

  const clearBuildings = useCallback(() => {
    setPlacedBuildings([]);
    setPlannedGordEdges([]);
    setTotalGordCells(0);
    setCoverageStats({ covered: 0, total: 0, shouldPause: false });
    setNextBuildingId(10);
    setTerrainOwnership(new Array(terrainOwnership.length).fill(null));
  }, [terrainOwnership.length]);

  const planGord = useCallback(() => {
    if (hubBuildings.length === 0) {
      setPlannedGordEdges([]);
      setTotalGordCells(0);
      setCoverageStats({ covered: 0, total: 0, shouldPause: false });
      return;
    }
    const mockState = createMockWorldState(placedBuildings, terrainOwnership, canvasWidth, canvasHeight);
    const clusters = findGordClusters(hubBuildings, 1, mockState);
    const gridWidth = Math.ceil(canvasWidth / GORD_GRID_RESOLUTION);
    const gridHeight = Math.ceil(canvasHeight / GORD_GRID_RESOLUTION);

    // Get existing walls for coverage analysis
    const existingWalls = placedBuildings.filter(
      (b) => b.buildingType === BuildingType.Palisade || b.buildingType === BuildingType.Gate,
    );

    const allPlanned: PlannedGordEdge[] = [];
    let totalCells = 0;
    let totalCoveredEdges = 0;
    let totalEdges = 0;
    let shouldPauseExpansion = false;

    for (const cluster of clusters) {
      // Use stricter minimum for actual palisade placement (avoid very small territories)
      if (cluster.size < GORD_MIN_CELLS_FOR_SURROUNDING) continue;
      
      totalCells += cluster.size;

      // Analyze border coverage
      const coverage = analyzeBorderCoverage(
        cluster,
        existingWalls,
        gridWidth,
        gridHeight,
        canvasWidth,
        canvasHeight,
      );

      totalEdges += coverage.totalBorderEdges;
      totalCoveredEdges += coverage.coveredBorderEdges;

      // Check if expansion should be paused
      if (coverage.unsurroundedRatio > GORD_UNSURROUNDED_THRESHOLD) {
        shouldPauseExpansion = true;
      }

      // Get all edges and filter out covered ones
      const allEdges = traceGordPerimeter(cluster, gridWidth, gridHeight);
      const uncoveredEdges = filterUncoveredEdges(allEdges, existingWalls, canvasWidth, canvasHeight);

      // Only assign gates to uncovered edges
      const edgesWithGates = assignGates(uncoveredEdges);
      allPlanned.push(...edgesWithGates);
    }

    setPlannedGordEdges(allPlanned);
    setTotalGordCells(totalCells);
    setCoverageStats({
      covered: totalCoveredEdges,
      total: totalEdges,
      shouldPause: shouldPauseExpansion,
    });
  }, [hubBuildings, placedBuildings, terrainOwnership, canvasWidth, canvasHeight]);

  const executeGordPlan = useCallback(() => {
    if (plannedGordEdges.length === 0) return;
    const newBuildings: BuildingEntity[] = [];
    let currentId = nextBuildingId;
    const tempOwnership = [...terrainOwnership];
    const tempState = {
      mapDimensions: { width: canvasWidth, height: canvasHeight },
      terrainOwnership: tempOwnership,
    } as GameWorldState;

    for (const edge of plannedGordEdges) {
      const step = 20;
      const numSteps = GORD_GRID_RESOLUTION / step;
      const dx = edge.to.x > edge.from.x ? step : edge.to.x < edge.from.x ? -step : 0;
      const dy = edge.to.y > edge.from.y ? step : edge.to.y < edge.from.y ? -step : 0;

      let segmentsToSkip = 0;
      for (let i = 0; i < numSteps; i++) {
        if (segmentsToSkip > 0) {
          segmentsToSkip--;
          continue;
        }

        const pos = {
          x: (edge.from.x + dx * i + dx / 2 + canvasWidth) % canvasWidth,
          y: (edge.from.y + dy * i + dy / 2 + canvasHeight) % canvasHeight,
        };

        const buildingType = edge.isGate && i === 0 ? BuildingType.Gate : BuildingType.Palisade;
        const newBuilding = createBuildingEntity(currentId++, buildingType, pos, 1);
        newBuildings.push(newBuilding);
        paintTerrainOwnership(pos, TERRITORY_BUILDING_RADIUS, 1, tempState);

        segmentsToSkip = buildingType === BuildingType.Gate ? 2 : 0;
      }
    }

    setTerrainOwnership(tempOwnership);
    setPlacedBuildings((prev) => [...prev, ...newBuildings]);
    setNextBuildingId(currentId);
    setPlannedGordEdges([]);
    setTotalGordCells(0);
  }, [plannedGordEdges, nextBuildingId, terrainOwnership, canvasWidth, canvasHeight]);

  const autoPlaceSingleBuilding = useCallback(() => {
    const mockState = createMockWorldState(placedBuildings, terrainOwnership, canvasWidth, canvasHeight);
    const humanPos = { x: canvasWidth / 2, y: canvasHeight / 2 };
    const position = findAdjacentBuildingPlacement(selectedType, 1, mockState, 200, 100, humanPos);

    if (position) {
      const newBuilding = createBuildingEntity(nextBuildingId, selectedType, position, 1);
      const tempOwnership = [...terrainOwnership];
      const tempState = {
        mapDimensions: { width: canvasWidth, height: canvasHeight },
        terrainOwnership: tempOwnership,
      } as GameWorldState;
      paintTerrainOwnership(position, TERRITORY_BUILDING_RADIUS, 1, tempState);
      setTerrainOwnership(tempOwnership);
      setPlacedBuildings((prev) => [...prev, newBuilding]);
      setNextBuildingId((prev) => prev + 1);
    }
  }, [placedBuildings, terrainOwnership, selectedType, nextBuildingId, canvasWidth, canvasHeight]);

  return {
    selectedType,
    setSelectedType,
    placedBuildings,
    mousePos,
    setMousePos,
    nextBuildingId,
    showTerritoryGrid,
    setShowTerritoryGrid,
    showGordGrid,
    setShowGordGrid,
    showPlannedGord,
    setShowPlannedGord,
    plannedGordEdges,
    totalGordCells,
    terrainOwnership,
    hubBuildings,
    gordStats,
    handleCanvasClick,
    handleMouseMove,
    clearBuildings,
    planGord,
    executeGordPlan,
    autoPlaceSingleBuilding,
  };
};

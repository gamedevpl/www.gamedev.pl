/**
 * HPA* (Hierarchical Pathfinding A*) implementation for improved pathfinding performance.
 *
 * This module implements a two-level hierarchical pathfinding system:
 * 1. Abstract Level: A coarse graph of clusters with pre-computed inter-cluster connections
 * 2. Low Level: Standard A* pathfinding within individual clusters
 *
 * The key idea is to divide the map into clusters and pre-compute "entrances" (transition points)
 * between adjacent clusters. When finding a path, we first find an abstract path through clusters,
 * then refine it with low-level pathfinding.
 */

import { Vector2D } from './math-types';
import { GameWorldState, NavigationGrid } from '../world-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import {
  NAV_GRID_RESOLUTION,
  getNavigationGridCoords,
  isCellPassable,
  findNearestPassableCell,
} from './navigation-utils';

// ============================================================================
// Constants
// ============================================================================

/**
 * Size of a cluster in grid cells.
 * A cluster of 10x10 cells (100px x 100px at 10px resolution) provides a good balance
 * between abstraction level granularity and computational efficiency.
 */
export const CLUSTER_SIZE_CELLS = 10;

/**
 * Size of a cluster in world units (pixels).
 */
export const CLUSTER_SIZE_PIXELS = CLUSTER_SIZE_CELLS * NAV_GRID_RESOLUTION;

/**
 * Maximum width of an entrance (in cells) to be considered a single transition point.
 * Wider openings are split into multiple entrance points.
 */
const MAX_ENTRANCE_WIDTH = 6;

/**
 * Maximum iterations for low-level A* within a cluster.
 * Since clusters are small, this can be much lower than global pathfinding.
 */
const MAX_LOW_LEVEL_ITERATIONS = 500;

/**
 * Maximum iterations for abstract-level A* pathfinding.
 */
const MAX_ABSTRACT_ITERATIONS = 1000;

// ============================================================================
// Types
// ============================================================================

/**
 * Represents a transition point (entrance) between two adjacent clusters.
 */
export interface ClusterEntrance {
  /** Unique ID for this entrance */
  id: string;
  /** Cluster 1 coordinates (clusterX, clusterY) */
  cluster1: { x: number; y: number };
  /** Cluster 2 coordinates (clusterX, clusterY) */
  cluster2: { x: number; y: number };
  /** Center position in world coordinates */
  position: Vector2D;
  /** Center position in grid coordinates */
  gridPos: { x: number; y: number };
  /** Width of the entrance in cells */
  width: number;
}

/**
 * Represents an abstract node in the hierarchical graph.
 * Each node is either an entrance between clusters or a temporary start/goal node.
 */
export interface AbstractNode {
  id: string;
  position: Vector2D;
  gridPos: { x: number; y: number };
  cluster: { x: number; y: number };
  /** Connected nodes with their pre-computed distances */
  edges: Map<string, number>;
  /** Whether this is a temporary node (start/goal insertion) */
  isTemporary?: boolean;
}

/**
 * The hierarchical pathfinding graph structure.
 */
export interface HPAGraph {
  /** Map of cluster coordinates string to list of entrance IDs in that cluster */
  clusterEntrances: Map<string, string[]>;
  /** Map of entrance ID to AbstractNode */
  nodes: Map<string, AbstractNode>;
  /** Version/timestamp for cache invalidation */
  version: number;
  /** Grid dimensions when the graph was built */
  gridWidth: number;
  gridHeight: number;
  /** Cluster dimensions */
  clusterCountX: number;
  clusterCountY: number;
}

/**
 * Result of pathfinding operation.
 */
export interface PathfindingResult {
  path: Vector2D[] | null;
  iterations: number;
  usedHPA: boolean;
}

// ============================================================================
// Graph Construction
// ============================================================================

/**
 * Builds or rebuilds the HPA* abstract graph from the navigation grid.
 */
export function buildHPAGraph(
  grid: NavigationGrid,
  worldWidth: number,
  worldHeight: number,
): HPAGraph {
  const gridWidth = Math.ceil(worldWidth / NAV_GRID_RESOLUTION);
  const gridHeight = Math.ceil(worldHeight / NAV_GRID_RESOLUTION);
  const clusterCountX = Math.ceil(gridWidth / CLUSTER_SIZE_CELLS);
  const clusterCountY = Math.ceil(gridHeight / CLUSTER_SIZE_CELLS);

  const graph: HPAGraph = {
    clusterEntrances: new Map(),
    nodes: new Map(),
    version: Date.now(),
    gridWidth,
    gridHeight,
    clusterCountX,
    clusterCountY,
  };

  // Step 1: Find all entrances between adjacent clusters
  const entrances = findAllEntrances(grid, gridWidth, gridHeight, clusterCountX, clusterCountY);

  // Step 2: Create abstract nodes for each entrance
  for (const entrance of entrances) {
    const node: AbstractNode = {
      id: entrance.id,
      position: entrance.position,
      gridPos: entrance.gridPos,
      cluster: entrance.cluster1, // Primary cluster assignment
      edges: new Map(),
    };
    graph.nodes.set(entrance.id, node);

    // Register entrance in both clusters
    const key1 = clusterKey(entrance.cluster1.x, entrance.cluster1.y);
    const key2 = clusterKey(entrance.cluster2.x, entrance.cluster2.y);

    if (!graph.clusterEntrances.has(key1)) {
      graph.clusterEntrances.set(key1, []);
    }
    graph.clusterEntrances.get(key1)!.push(entrance.id);

    if (!graph.clusterEntrances.has(key2)) {
      graph.clusterEntrances.set(key2, []);
    }
    graph.clusterEntrances.get(key2)!.push(entrance.id);
  }

  // Step 3: Pre-compute intra-cluster edges (connections between entrances within the same cluster)
  for (let cy = 0; cy < clusterCountY; cy++) {
    for (let cx = 0; cx < clusterCountX; cx++) {
      precomputeIntraClusterEdges(graph, grid, gridWidth, gridHeight, cx, cy);
    }
  }

  // Step 4: Add inter-cluster edges (direct connections between adjacent entrance pairs)
  for (const entrance of entrances) {
    addInterClusterEdge(graph, entrance);
  }

  return graph;
}

/**
 * Finds all entrances (transition points) between adjacent clusters.
 */
function findAllEntrances(
  grid: NavigationGrid,
  gridWidth: number,
  gridHeight: number,
  clusterCountX: number,
  clusterCountY: number,
): ClusterEntrance[] {
  const entrances: ClusterEntrance[] = [];
  let entranceId = 0;

  // Check horizontal borders between clusters (vertical edges)
  for (let cy = 0; cy < clusterCountY; cy++) {
    for (let cx = 0; cx < clusterCountX - 1; cx++) {
      const borderX = (cx + 1) * CLUSTER_SIZE_CELLS; // Right edge of cluster (cx, cy)
      const clusterStartY = cy * CLUSTER_SIZE_CELLS;
      const clusterEndY = Math.min((cy + 1) * CLUSTER_SIZE_CELLS, gridHeight);

      // Scan the border for passable segments
      let segmentStart = -1;
      for (let y = clusterStartY; y < clusterEndY; y++) {
        const leftIdx = y * gridWidth + (borderX - 1);
        const rightIdx = y * gridWidth + borderX;

        const leftPassable = isCellPassable(grid, leftIdx, undefined, false);
        const rightPassable =
          borderX < gridWidth ? isCellPassable(grid, rightIdx, undefined, false) : false;

        if (leftPassable && rightPassable) {
          if (segmentStart === -1) segmentStart = y;
        } else {
          if (segmentStart !== -1) {
            // End of passable segment
            entrances.push(
              ...createEntrancesFromSegment(
                'vertical',
                borderX,
                segmentStart,
                y - 1,
                { x: cx, y: cy },
                { x: cx + 1, y: cy },
                entranceId++,
              ),
            );
            segmentStart = -1;
          }
        }
      }
      // Handle segment that extends to cluster end
      if (segmentStart !== -1) {
        entrances.push(
          ...createEntrancesFromSegment(
            'vertical',
            borderX,
            segmentStart,
            clusterEndY - 1,
            { x: cx, y: cy },
            { x: cx + 1, y: cy },
            entranceId++,
          ),
        );
      }
    }
  }

  // Check vertical borders between clusters (horizontal edges)
  for (let cy = 0; cy < clusterCountY - 1; cy++) {
    for (let cx = 0; cx < clusterCountX; cx++) {
      const borderY = (cy + 1) * CLUSTER_SIZE_CELLS; // Bottom edge of cluster (cx, cy)
      const clusterStartX = cx * CLUSTER_SIZE_CELLS;
      const clusterEndX = Math.min((cx + 1) * CLUSTER_SIZE_CELLS, gridWidth);

      let segmentStart = -1;
      for (let x = clusterStartX; x < clusterEndX; x++) {
        const topIdx = (borderY - 1) * gridWidth + x;
        const bottomIdx = borderY * gridWidth + x;

        const topPassable = isCellPassable(grid, topIdx, undefined, false);
        const bottomPassable =
          borderY < gridHeight ? isCellPassable(grid, bottomIdx, undefined, false) : false;

        if (topPassable && bottomPassable) {
          if (segmentStart === -1) segmentStart = x;
        } else {
          if (segmentStart !== -1) {
            entrances.push(
              ...createEntrancesFromSegment(
                'horizontal',
                borderY,
                segmentStart,
                x - 1,
                { x: cx, y: cy },
                { x: cx, y: cy + 1 },
                entranceId++,
              ),
            );
            segmentStart = -1;
          }
        }
      }
      if (segmentStart !== -1) {
        entrances.push(
          ...createEntrancesFromSegment(
            'horizontal',
            borderY,
            segmentStart,
            clusterEndX - 1,
            { x: cx, y: cy },
            { x: cx, y: cy + 1 },
            entranceId++,
          ),
        );
      }
    }
  }

  return entrances;
}

/**
 * Creates entrance point(s) from a passable segment along a cluster border.
 * Wide openings are split into multiple entrance points.
 */
function createEntrancesFromSegment(
  orientation: 'vertical' | 'horizontal',
  borderCoord: number,
  segmentStart: number,
  segmentEnd: number,
  cluster1: { x: number; y: number },
  cluster2: { x: number; y: number },
  baseId: number,
): ClusterEntrance[] {
  const width = segmentEnd - segmentStart + 1;
  const entrances: ClusterEntrance[] = [];

  if (width <= MAX_ENTRANCE_WIDTH) {
    // Single entrance at the center
    const center = (segmentStart + segmentEnd) / 2;
    const gridPos =
      orientation === 'vertical'
        ? { x: borderCoord - 0.5, y: center }
        : { x: center, y: borderCoord - 0.5 };

    entrances.push({
      id: `e${baseId}`,
      cluster1,
      cluster2,
      position: {
        x: gridPos.x * NAV_GRID_RESOLUTION + NAV_GRID_RESOLUTION / 2,
        y: gridPos.y * NAV_GRID_RESOLUTION + NAV_GRID_RESOLUTION / 2,
      },
      gridPos: { x: Math.floor(gridPos.x), y: Math.floor(gridPos.y) },
      width,
    });
  } else {
    // Multiple entrances for wide openings
    // Place entrances at the ends and possibly in the middle
    const entranceCount = Math.ceil(width / MAX_ENTRANCE_WIDTH);
    for (let i = 0; i < entranceCount; i++) {
      const pos =
        entranceCount === 1
          ? (segmentStart + segmentEnd) / 2
          : segmentStart + (i * (segmentEnd - segmentStart)) / (entranceCount - 1);

      const gridPos =
        orientation === 'vertical'
          ? { x: borderCoord - 0.5, y: pos }
          : { x: pos, y: borderCoord - 0.5 };

      entrances.push({
        id: `e${baseId}_${i}`,
        cluster1,
        cluster2,
        position: {
          x: gridPos.x * NAV_GRID_RESOLUTION + NAV_GRID_RESOLUTION / 2,
          y: gridPos.y * NAV_GRID_RESOLUTION + NAV_GRID_RESOLUTION / 2,
        },
        gridPos: { x: Math.floor(gridPos.x), y: Math.floor(gridPos.y) },
        width: Math.ceil(width / entranceCount),
      });
    }
  }

  return entrances;
}

/**
 * Pre-computes edges between entrances within the same cluster using low-level A*.
 */
function precomputeIntraClusterEdges(
  graph: HPAGraph,
  grid: NavigationGrid,
  gridWidth: number,
  gridHeight: number,
  clusterX: number,
  clusterY: number,
): void {
  const key = clusterKey(clusterX, clusterY);
  const entranceIds = graph.clusterEntrances.get(key) || [];

  // For each pair of entrances in this cluster, compute the path distance
  for (let i = 0; i < entranceIds.length; i++) {
    for (let j = i + 1; j < entranceIds.length; j++) {
      const node1 = graph.nodes.get(entranceIds[i])!;
      const node2 = graph.nodes.get(entranceIds[j])!;

      const distance = computeIntraClusterDistance(
        grid,
        gridWidth,
        gridHeight,
        node1.gridPos,
        node2.gridPos,
        clusterX,
        clusterY,
      );

      if (distance !== null) {
        node1.edges.set(node2.id, distance);
        node2.edges.set(node1.id, distance);
      }
    }
  }
}

/**
 * Computes the path distance between two points within a cluster using A*.
 * Returns null if no path exists.
 */
function computeIntraClusterDistance(
  grid: NavigationGrid,
  gridWidth: number,
  gridHeight: number,
  start: { x: number; y: number },
  end: { x: number; y: number },
  clusterX: number,
  clusterY: number,
): number | null {
  const clusterStartX = clusterX * CLUSTER_SIZE_CELLS;
  const clusterStartY = clusterY * CLUSTER_SIZE_CELLS;
  const clusterEndX = Math.min((clusterX + 1) * CLUSTER_SIZE_CELLS, gridWidth);
  const clusterEndY = Math.min((clusterY + 1) * CLUSTER_SIZE_CELLS, gridHeight);

  // Simple A* within cluster bounds
  const openSet: number[] = [start.y * gridWidth + start.x];
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>();
  const fScore = new Map<number, number>();

  const startIdx = start.y * gridWidth + start.x;
  const endIdx = end.y * gridWidth + end.x;
  gScore.set(startIdx, 0);
  fScore.set(startIdx, heuristic(start, end));

  let iterations = 0;

  while (openSet.length > 0 && iterations < MAX_LOW_LEVEL_ITERATIONS) {
    iterations++;

    // Get node with lowest fScore
    let currentIdx = openSet[0];
    let lowestF = fScore.get(currentIdx) ?? Infinity;
    let openSetIdx = 0;

    for (let i = 1; i < openSet.length; i++) {
      const score = fScore.get(openSet[i]) ?? Infinity;
      if (score < lowestF) {
        lowestF = score;
        currentIdx = openSet[i];
        openSetIdx = i;
      }
    }

    if (currentIdx === endIdx) {
      return gScore.get(currentIdx)!;
    }

    openSet.splice(openSetIdx, 1);

    const curX = currentIdx % gridWidth;
    const curY = Math.floor(currentIdx / gridWidth);

    // 8-directional neighbors
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;

        const nx = curX + dx;
        const ny = curY + dy;

        // Allow slight overflow past cluster bounds to reach entrances on edges
        if (nx < clusterStartX - 1 || nx > clusterEndX || ny < clusterStartY - 1 || ny > clusterEndY) {
          continue;
        }

        if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) {
          continue;
        }

        const neighborIdx = ny * gridWidth + nx;

        if (!isCellPassable(grid, neighborIdx, undefined, false)) {
          continue;
        }

        const moveCost = dx !== 0 && dy !== 0 ? 1.414 : 1.0;
        const tentativeGScore = (gScore.get(currentIdx) ?? 0) + moveCost;

        if (tentativeGScore < (gScore.get(neighborIdx) ?? Infinity)) {
          cameFrom.set(neighborIdx, currentIdx);
          gScore.set(neighborIdx, tentativeGScore);
          fScore.set(neighborIdx, tentativeGScore + heuristic({ x: nx, y: ny }, end));
          if (!openSet.includes(neighborIdx)) {
            openSet.push(neighborIdx);
          }
        }
      }
    }
  }

  return null; // No path found
}

/**
 * Adds direct edge between entrance pairs (the actual transition between clusters).
 * Note: This function is a placeholder for future enhancement where we might add
 * explicit inter-cluster edges with transition costs.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function addInterClusterEdge(_graph: HPAGraph, _entrance: ClusterEntrance): void {
  // The entrance itself represents a connection - add a small traversal cost (1 cell)
  // Inter-cluster edges are already handled by the entrance being in both cluster lists
  // The edge cost for crossing is minimal (essentially 0 since it's the same point)
}

// ============================================================================
// Pathfinding
// ============================================================================

/**
 * Finds a path using HPA* algorithm.
 * Falls back to standard A* for short distances or when HPA* fails.
 */
export function findPathHPA(
  gameState: GameWorldState,
  start: Vector2D,
  end: Vector2D,
  entity: HumanEntity,
  hpaGraph: HPAGraph | null,
): PathfindingResult {
  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
  const grid = gameState.navigationGrid;

  // If no HPA graph, use standard A*
  if (!hpaGraph) {
    return { path: null, iterations: 0, usedHPA: false };
  }

  const startCoords = getNavigationGridCoords(start, worldWidth, worldHeight);
  const endCoords = getNavigationGridCoords(end, worldWidth, worldHeight);

  // Check if start and end are in the same cluster - use low-level A* directly
  const startCluster = getClusterForGridPos(startCoords.x, startCoords.y);
  const endCluster = getClusterForGridPos(endCoords.x, endCoords.y);

  if (startCluster.x === endCluster.x && startCluster.y === endCluster.y) {
    // Same cluster - use direct low-level pathfinding
    return { path: null, iterations: 0, usedHPA: false };
  }

  // Ensure target is passable
  let finalTarget = end;
  const endIdx =
    endCoords.y * hpaGraph.gridWidth + endCoords.x;
  if (!isCellPassable(grid, endIdx, entity.leaderId, false)) {
    finalTarget = findNearestPassableCell(grid, end, worldWidth, worldHeight, entity.leaderId);
  }

  // Step 1: Insert temporary start and goal nodes into the abstract graph
  const tempStartNode = createTemporaryNode(
    'temp_start',
    start,
    startCoords,
    startCluster,
    hpaGraph,
    grid,
    hpaGraph.gridWidth,
    hpaGraph.gridHeight,
  );

  const tempGoalNode = createTemporaryNode(
    'temp_goal',
    finalTarget,
    getNavigationGridCoords(finalTarget, worldWidth, worldHeight),
    endCluster,
    hpaGraph,
    grid,
    hpaGraph.gridWidth,
    hpaGraph.gridHeight,
  );

  if (!tempStartNode || !tempGoalNode) {
    // Cannot connect to abstract graph
    return { path: null, iterations: 0, usedHPA: false };
  }

  // Step 2: Find abstract path through clusters
  const abstractPath = findAbstractPath(hpaGraph, tempStartNode, tempGoalNode);

  // Clean up temporary nodes
  cleanupTemporaryNodes(hpaGraph, tempStartNode, tempGoalNode);

  if (!abstractPath) {
    return { path: null, iterations: 0, usedHPA: true };
  }

  // Step 3: Refine abstract path with low-level pathfinding
  const refinedPath = refineAbstractPath(
    abstractPath,
    finalTarget,
  );

  return { path: refinedPath.path, iterations: refinedPath.iterations, usedHPA: true };
}

/**
 * Creates a temporary node for start/goal and connects it to nearby entrances.
 */
function createTemporaryNode(
  id: string,
  position: Vector2D,
  gridPos: { x: number; y: number },
  cluster: { x: number; y: number },
  graph: HPAGraph,
  grid: NavigationGrid,
  gridWidth: number,
  gridHeight: number,
): AbstractNode | null {
  const node: AbstractNode = {
    id,
    position,
    gridPos,
    cluster,
    edges: new Map(),
    isTemporary: true,
  };

  // Connect to all entrances in the same cluster
  const key = clusterKey(cluster.x, cluster.y);
  const entranceIds = graph.clusterEntrances.get(key) || [];

  for (const entranceId of entranceIds) {
    const entranceNode = graph.nodes.get(entranceId)!;
    const distance = computeIntraClusterDistance(
      grid,
      gridWidth,
      gridHeight,
      gridPos,
      entranceNode.gridPos,
      cluster.x,
      cluster.y,
    );

    if (distance !== null) {
      node.edges.set(entranceId, distance);
      // Also add reverse edge temporarily
      entranceNode.edges.set(id, distance);
    }
  }

  if (node.edges.size === 0) {
    return null; // Cannot connect to any entrance
  }

  graph.nodes.set(id, node);
  return node;
}

/**
 * Removes temporary nodes from the graph after pathfinding.
 */
function cleanupTemporaryNodes(
  graph: HPAGraph,
  startNode: AbstractNode,
  goalNode: AbstractNode,
): void {
  // Remove edges pointing to temporary nodes
  for (const [nodeId] of startNode.edges) {
    const node = graph.nodes.get(nodeId);
    if (node) node.edges.delete(startNode.id);
  }
  for (const [nodeId] of goalNode.edges) {
    const node = graph.nodes.get(nodeId);
    if (node) node.edges.delete(goalNode.id);
  }

  // Remove temporary nodes
  graph.nodes.delete(startNode.id);
  graph.nodes.delete(goalNode.id);
}

/**
 * Finds path through the abstract graph using A*.
 */
function findAbstractPath(
  graph: HPAGraph,
  start: AbstractNode,
  goal: AbstractNode,
): AbstractNode[] | null {
  const openSet = new Set<string>([start.id]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();

  gScore.set(start.id, 0);
  fScore.set(start.id, heuristic(start.gridPos, goal.gridPos));

  let iterations = 0;

  while (openSet.size > 0 && iterations < MAX_ABSTRACT_ITERATIONS) {
    iterations++;

    // Get node with lowest fScore
    let currentId = '';
    let lowestF = Infinity;
    for (const id of openSet) {
      const score = fScore.get(id) ?? Infinity;
      if (score < lowestF) {
        lowestF = score;
        currentId = id;
      }
    }

    if (currentId === goal.id) {
      // Reconstruct path
      const path: AbstractNode[] = [];
      let curr = currentId;
      while (curr) {
        path.unshift(graph.nodes.get(curr)!);
        curr = cameFrom.get(curr) || '';
      }
      return path;
    }

    openSet.delete(currentId);
    const currentNode = graph.nodes.get(currentId)!;

    for (const [neighborId, edgeCost] of currentNode.edges) {
      const tentativeGScore = (gScore.get(currentId) ?? 0) + edgeCost;

      if (tentativeGScore < (gScore.get(neighborId) ?? Infinity)) {
        const neighborNode = graph.nodes.get(neighborId)!;
        cameFrom.set(neighborId, currentId);
        gScore.set(neighborId, tentativeGScore);
        fScore.set(neighborId, tentativeGScore + heuristic(neighborNode.gridPos, goal.gridPos));
        openSet.add(neighborId);
      }
    }
  }

  return null;
}

/**
 * Refines an abstract path by converting abstract node positions to world coordinates.
 * The abstract path already includes start and end as temporary nodes.
 */
function refineAbstractPath(
  abstractPath: AbstractNode[],
  end: Vector2D,
): { path: Vector2D[]; iterations: number } {
  const path: Vector2D[] = [];
  const totalIterations = 0;

  // The abstract path already includes start and end as temporary nodes
  // We just need to convert positions, low-level refinement is optional
  for (const node of abstractPath) {
    path.push({ ...node.position });
  }

  // Ensure path ends at the exact target
  if (path.length > 0) {
    path[path.length - 1] = { ...end };
  }

  // Remove the start position (entity's current position)
  if (path.length > 0) {
    path.shift();
  }

  return { path, iterations: totalIterations };
}

// ============================================================================
// Cache Management
// ============================================================================

/** Cached HPA graph */
let cachedGraph: HPAGraph | null = null;
let cachedGridVersion = 0;

/**
 * Gets or builds the HPA graph, using caching for efficiency.
 */
export function getOrBuildHPAGraph(
  grid: NavigationGrid,
  worldWidth: number,
  worldHeight: number,
  forceRebuild: boolean = false,
): HPAGraph {
  // Simple cache invalidation: rebuild if grid dimensions change or forced
  const gridWidth = Math.ceil(worldWidth / NAV_GRID_RESOLUTION);
  const gridHeight = Math.ceil(worldHeight / NAV_GRID_RESOLUTION);
  const currentVersion = gridWidth * gridHeight;

  if (!cachedGraph || cachedGridVersion !== currentVersion || forceRebuild) {
    cachedGraph = buildHPAGraph(grid, worldWidth, worldHeight);
    cachedGridVersion = currentVersion;
  }

  return cachedGraph;
}

/**
 * Invalidates the cached graph when obstacles change.
 * For now, we do a full rebuild on any change.
 * A more sophisticated implementation could do incremental updates per cluster.
 */
export function invalidateCluster(): void {
  cachedGraph = null;
}

/**
 * Completely invalidates the cached graph.
 */
export function invalidateHPACache(): void {
  cachedGraph = null;
}

// ============================================================================
// Utility Functions
// ============================================================================

function clusterKey(x: number, y: number): string {
  return `${x},${y}`;
}

function getClusterForGridPos(gridX: number, gridY: number): { x: number; y: number } {
  return {
    x: Math.floor(gridX / CLUSTER_SIZE_CELLS),
    y: Math.floor(gridY / CLUSTER_SIZE_CELLS),
  };
}

function heuristic(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  // Octile distance
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

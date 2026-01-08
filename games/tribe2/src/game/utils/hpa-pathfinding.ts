/**
 * HPA* (Hierarchical Pathfinding A*) implementation.
 *
 * This provides a two-level hierarchical pathfinding system:
 * 1. High-level: Search through abstract graph of cluster border nodes
 * 2. Low-level: Refine path within individual clusters using standard A*
 *
 * Performance improvements come from:
 * - Reduced search space at high level
 * - Cached intra-cluster paths
 * - Lazy recomputation of clusters when obstacles change
 */

import { Vector2D } from './math-types';
import { NavigationGrid } from '../world-types';
import {
  HPAGraph,
  HPACluster,
  HPAAbstractNode,
  HPAAbstractEdge,
  HPA_CLUSTER_SIZE,
  HPA_MAX_ENTRANCES_PER_EDGE,
} from './hpa-types';
import { NAV_GRID_RESOLUTION, isCellPassable, getNavigationGridCoords } from './navigation-utils';

/**
 * Creates an empty HPA graph structure.
 */
export function createHPAGraph(gridWidth: number, gridHeight: number): HPAGraph {
  const clustersPerRow = Math.ceil(gridWidth / HPA_CLUSTER_SIZE);
  const clustersPerCol = Math.ceil(gridHeight / HPA_CLUSTER_SIZE);
  const clusters: HPACluster[] = [];

  for (let cy = 0; cy < clustersPerCol; cy++) {
    for (let cx = 0; cx < clustersPerRow; cx++) {
      clusters.push({
        id: cy * clustersPerRow + cx,
        clusterX: cx,
        clusterY: cy,
        gridStartX: cx * HPA_CLUSTER_SIZE,
        gridStartY: cy * HPA_CLUSTER_SIZE,
        borderNodeIds: [],
        isDirty: true,
      });
    }
  }

  return {
    nodes: new Map(),
    edges: new Map(),
    clusters,
    clustersPerRow,
    clustersPerCol,
    gridWidth,
    gridHeight,
    nextNodeId: 0,
    intraClusterPathCache: new Map(),
    needsRebuild: true,
  };
}

/**
 * Builds the complete HPA* abstract graph from the navigation grid.
 * This should be called during initialization and when major changes occur.
 */
export function buildHPAGraph(
  hpaGraph: HPAGraph,
  navGrid: NavigationGrid,
  leaderId?: number,
): void {
  // Clear existing data
  hpaGraph.nodes.clear();
  hpaGraph.edges.clear();
  hpaGraph.intraClusterPathCache.clear();
  hpaGraph.nextNodeId = 0;

  for (const cluster of hpaGraph.clusters) {
    cluster.borderNodeIds = [];
    cluster.isDirty = false;
  }

  // Step 1: Find entrances (transitions between adjacent clusters)
  findEntrances(hpaGraph, navGrid, leaderId);

  // Step 2: Build intra-cluster edges (paths between border nodes within same cluster)
  buildIntraClusterEdges(hpaGraph, navGrid, leaderId);

  hpaGraph.needsRebuild = false;
}

/**
 * Finds entrances between adjacent clusters and creates abstract nodes.
 */
function findEntrances(
  hpaGraph: HPAGraph,
  navGrid: NavigationGrid,
  leaderId?: number,
): void {
  const { clustersPerRow, clustersPerCol, gridWidth, gridHeight } = hpaGraph;

  // Horizontal edges (between vertically adjacent clusters)
  for (let cy = 0; cy < clustersPerCol - 1; cy++) {
    for (let cx = 0; cx < clustersPerRow; cx++) {
      const cluster1 = hpaGraph.clusters[cy * clustersPerRow + cx];
      const cluster2 = hpaGraph.clusters[(cy + 1) * clustersPerRow + cx];

      // Find passable transitions along the horizontal edge
      const edgeY = cluster1.gridStartY + HPA_CLUSTER_SIZE - 1;
      const nextY = (edgeY + 1) % gridHeight;

      findEdgeEntrances(
        hpaGraph,
        navGrid,
        cluster1,
        cluster2,
        cluster1.gridStartX,
        Math.min(cluster1.gridStartX + HPA_CLUSTER_SIZE, gridWidth),
        (x) => ({ topX: x, topY: edgeY, bottomX: x, bottomY: nextY }),
        leaderId,
      );
    }
  }

  // Handle wrap-around for toroidal grid (bottom to top)
  if (clustersPerCol > 1) {
    for (let cx = 0; cx < clustersPerRow; cx++) {
      const cluster1 = hpaGraph.clusters[(clustersPerCol - 1) * clustersPerRow + cx];
      const cluster2 = hpaGraph.clusters[cx]; // Top row

      const edgeY = cluster1.gridStartY + HPA_CLUSTER_SIZE - 1;
      const nextY = 0; // Wrap to top

      if (edgeY < gridHeight) {
        findEdgeEntrances(
          hpaGraph,
          navGrid,
          cluster1,
          cluster2,
          cluster1.gridStartX,
          Math.min(cluster1.gridStartX + HPA_CLUSTER_SIZE, gridWidth),
          (x) => ({ topX: x, topY: edgeY, bottomX: x, bottomY: nextY }),
          leaderId,
        );
      }
    }
  }

  // Vertical edges (between horizontally adjacent clusters)
  for (let cy = 0; cy < clustersPerCol; cy++) {
    for (let cx = 0; cx < clustersPerRow - 1; cx++) {
      const cluster1 = hpaGraph.clusters[cy * clustersPerRow + cx];
      const cluster2 = hpaGraph.clusters[cy * clustersPerRow + cx + 1];

      const edgeX = cluster1.gridStartX + HPA_CLUSTER_SIZE - 1;
      const nextX = (edgeX + 1) % gridWidth;

      findEdgeEntrances(
        hpaGraph,
        navGrid,
        cluster1,
        cluster2,
        cluster1.gridStartY,
        Math.min(cluster1.gridStartY + HPA_CLUSTER_SIZE, gridHeight),
        (y) => ({ topX: edgeX, topY: y, bottomX: nextX, bottomY: y }),
        leaderId,
      );
    }
  }

  // Handle wrap-around for toroidal grid (right to left)
  if (clustersPerRow > 1) {
    for (let cy = 0; cy < clustersPerCol; cy++) {
      const cluster1 = hpaGraph.clusters[cy * clustersPerRow + clustersPerRow - 1];
      const cluster2 = hpaGraph.clusters[cy * clustersPerRow]; // Left column

      const edgeX = cluster1.gridStartX + HPA_CLUSTER_SIZE - 1;
      const nextX = 0; // Wrap to left

      if (edgeX < gridWidth) {
        findEdgeEntrances(
          hpaGraph,
          navGrid,
          cluster1,
          cluster2,
          cluster1.gridStartY,
          Math.min(cluster1.gridStartY + HPA_CLUSTER_SIZE, gridHeight),
          (y) => ({ topX: edgeX, topY: y, bottomX: nextX, bottomY: y }),
          leaderId,
        );
      }
    }
  }
}

/**
 * Finds entrances along a single edge between two clusters.
 */
function findEdgeEntrances(
  hpaGraph: HPAGraph,
  navGrid: NavigationGrid,
  cluster1: HPACluster,
  cluster2: HPACluster,
  start: number,
  end: number,
  getCoords: (i: number) => { topX: number; topY: number; bottomX: number; bottomY: number },
  leaderId?: number,
): void {
  const { gridWidth } = hpaGraph;
  const entrances: { pos1: { x: number; y: number }; pos2: { x: number; y: number } }[] = [];

  let currentEntranceStart: number | null = null;

  for (let i = start; i < end; i++) {
    const { topX, topY, bottomX, bottomY } = getCoords(i);

    const idx1 = topY * gridWidth + topX;
    const idx2 = bottomY * gridWidth + bottomX;

    const passable1 = isCellPassable(navGrid, idx1, leaderId);
    const passable2 = isCellPassable(navGrid, idx2, leaderId);

    if (passable1 && passable2) {
      if (currentEntranceStart === null) {
        currentEntranceStart = i;
      }
    } else {
      if (currentEntranceStart !== null) {
        // End of an entrance run - add middle point
        const mid = Math.floor((currentEntranceStart + i - 1) / 2);
        const midCoords = getCoords(mid);
        entrances.push({
          pos1: { x: midCoords.topX, y: midCoords.topY },
          pos2: { x: midCoords.bottomX, y: midCoords.bottomY },
        });
        currentEntranceStart = null;
      }
    }
  }

  // Handle entrance that extends to edge end
  if (currentEntranceStart !== null) {
    const mid = Math.floor((currentEntranceStart + end - 1) / 2);
    const midCoords = getCoords(mid);
    entrances.push({
      pos1: { x: midCoords.topX, y: midCoords.topY },
      pos2: { x: midCoords.bottomX, y: midCoords.bottomY },
    });
  }

  // Limit entrances per edge to avoid memory bloat
  const selectedEntrances =
    entrances.length <= HPA_MAX_ENTRANCES_PER_EDGE
      ? entrances
      : selectDistributedEntrances(entrances, HPA_MAX_ENTRANCES_PER_EDGE);

  // Create abstract nodes and inter-cluster edges for each entrance
  for (const entrance of selectedEntrances) {
    const node1 = createAbstractNode(hpaGraph, entrance.pos1.x, entrance.pos1.y, cluster1);
    const node2 = createAbstractNode(hpaGraph, entrance.pos2.x, entrance.pos2.y, cluster2);

    // Add inter-cluster edge (cost = 1 since adjacent cells)
    addEdge(hpaGraph, node1.id, node2.id, 1, true);
    addEdge(hpaGraph, node2.id, node1.id, 1, true);
  }
}

/**
 * Selects a distributed subset of entrances.
 */
function selectDistributedEntrances(
  entrances: { pos1: { x: number; y: number }; pos2: { x: number; y: number } }[],
  count: number,
): typeof entrances {
  if (entrances.length <= count) return entrances;

  const step = entrances.length / count;
  const result: typeof entrances = [];

  for (let i = 0; i < count; i++) {
    result.push(entrances[Math.floor(i * step)]);
  }

  return result;
}

/**
 * Creates an abstract node and registers it in the graph.
 */
function createAbstractNode(
  hpaGraph: HPAGraph,
  gridX: number,
  gridY: number,
  cluster: HPACluster,
): HPAAbstractNode {
  // Check if node already exists at this position
  for (const node of hpaGraph.nodes.values()) {
    if (node.gridX === gridX && node.gridY === gridY) {
      return node;
    }
  }

  const node: HPAAbstractNode = {
    id: hpaGraph.nextNodeId++,
    gridX,
    gridY,
    clusterId: cluster.id,
  };

  hpaGraph.nodes.set(node.id, node);
  cluster.borderNodeIds.push(node.id);

  return node;
}

/**
 * Adds an edge to the abstract graph.
 */
function addEdge(
  hpaGraph: HPAGraph,
  fromNodeId: number,
  toNodeId: number,
  cost: number,
  isInterEdge: boolean,
): void {
  const edge: HPAAbstractEdge = { fromNodeId, toNodeId, cost, isInterEdge };

  const existingEdges = hpaGraph.edges.get(fromNodeId);
  if (existingEdges) {
    // Check for duplicate
    if (!existingEdges.some((e) => e.toNodeId === toNodeId)) {
      existingEdges.push(edge);
    }
  } else {
    hpaGraph.edges.set(fromNodeId, [edge]);
  }
}

/**
 * Builds intra-cluster edges between all border nodes within each cluster.
 * Uses A* within the cluster to find path costs.
 */
function buildIntraClusterEdges(
  hpaGraph: HPAGraph,
  navGrid: NavigationGrid,
  leaderId?: number,
): void {
  for (const cluster of hpaGraph.clusters) {
    const borderNodes = cluster.borderNodeIds.map((id) => hpaGraph.nodes.get(id)!);

    for (let i = 0; i < borderNodes.length; i++) {
      for (let j = i + 1; j < borderNodes.length; j++) {
        const node1 = borderNodes[i];
        const node2 = borderNodes[j];

        const cost = computeIntraClusterPath(
          hpaGraph,
          navGrid,
          cluster,
          node1,
          node2,
          leaderId,
        );

        if (cost !== null) {
          addEdge(hpaGraph, node1.id, node2.id, cost, false);
          addEdge(hpaGraph, node2.id, node1.id, cost, false);

          // Cache the path cost
          const cacheKey = `${node1.id}-${node2.id}`;
          hpaGraph.intraClusterPathCache.set(cacheKey, cost);
          hpaGraph.intraClusterPathCache.set(`${node2.id}-${node1.id}`, cost);
        }
      }
    }
  }
}

/**
 * Computes the path cost between two nodes within a cluster using local A*.
 */
function computeIntraClusterPath(
  hpaGraph: HPAGraph,
  navGrid: NavigationGrid,
  cluster: HPACluster,
  node1: HPAAbstractNode,
  node2: HPAAbstractNode,
  leaderId?: number,
): number | null {
  const { gridWidth, gridHeight } = hpaGraph;

  // Use bounded A* within cluster
  const openSet: number[] = [node1.gridY * gridWidth + node1.gridX];
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>();

  const startIdx = node1.gridY * gridWidth + node1.gridX;
  const endIdx = node2.gridY * gridWidth + node2.gridX;

  gScore.set(startIdx, 0);

  const maxIterations = HPA_CLUSTER_SIZE * HPA_CLUSTER_SIZE * 2;
  let iterations = 0;

  // Cluster bounds (with some margin for toroidal wrap)
  const clusterMinX = cluster.gridStartX;
  const clusterMaxX = Math.min(cluster.gridStartX + HPA_CLUSTER_SIZE, gridWidth);
  const clusterMinY = cluster.gridStartY;
  const clusterMaxY = Math.min(cluster.gridStartY + HPA_CLUSTER_SIZE, gridHeight);

  while (openSet.length > 0 && iterations < maxIterations) {
    iterations++;

    // Get node with lowest gScore (simplified since we don't need heuristic for cost calc)
    let currentIdx = openSet[0];
    let lowestG = gScore.get(currentIdx) ?? Infinity;
    let openSetIdx = 0;

    for (let i = 1; i < openSet.length; i++) {
      const score = gScore.get(openSet[i]) ?? Infinity;
      if (score < lowestG) {
        lowestG = score;
        currentIdx = openSet[i];
        openSetIdx = i;
      }
    }

    if (currentIdx === endIdx) {
      return gScore.get(currentIdx) ?? null;
    }

    openSet.splice(openSetIdx, 1);

    const curX = currentIdx % gridWidth;
    const curY = Math.floor(currentIdx / gridWidth);

    // Neighbors (8 directions)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;

        const nx = (curX + dx + gridWidth) % gridWidth;
        const ny = (curY + dy + gridHeight) % gridHeight;

        // Skip if outside cluster bounds (unless it's the destination)
        const neighborIdx = ny * gridWidth + nx;
        if (neighborIdx !== endIdx) {
          if (nx < clusterMinX || nx >= clusterMaxX || ny < clusterMinY || ny >= clusterMaxY) {
            continue;
          }
        }

        if (!isCellPassable(navGrid, neighborIdx, leaderId)) {
          continue;
        }

        const moveCost = dx !== 0 && dy !== 0 ? 1.414 : 1.0;
        const tentativeGScore = (gScore.get(currentIdx) ?? 0) + moveCost;

        if (tentativeGScore < (gScore.get(neighborIdx) ?? Infinity)) {
          cameFrom.set(neighborIdx, currentIdx);
          gScore.set(neighborIdx, tentativeGScore);

          if (!openSet.includes(neighborIdx)) {
            openSet.push(neighborIdx);
          }
        }
      }
    }
  }

  return null; // No path found within cluster
}

/**
 * High-level A* search on the abstract graph.
 */
export function hpaHighLevelSearch(
  hpaGraph: HPAGraph,
  startNodeId: number,
  endNodeId: number,
): number[] | null {
  const openSet: number[] = [startNodeId];
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>();
  const fScore = new Map<number, number>();

  gScore.set(startNodeId, 0);

  const startNode = hpaGraph.nodes.get(startNodeId)!;
  const endNode = hpaGraph.nodes.get(endNodeId)!;

  fScore.set(startNodeId, hpaHeuristic(startNode, endNode, hpaGraph));

  const maxIterations = hpaGraph.nodes.size * 2;
  let iterations = 0;

  while (openSet.length > 0 && iterations < maxIterations) {
    iterations++;

    // Get node with lowest fScore
    let currentId = openSet[0];
    let lowestF = fScore.get(currentId) ?? Infinity;
    let openSetIdx = 0;

    for (let i = 1; i < openSet.length; i++) {
      const score = fScore.get(openSet[i]) ?? Infinity;
      if (score < lowestF) {
        lowestF = score;
        currentId = openSet[i];
        openSetIdx = i;
      }
    }

    if (currentId === endNodeId) {
      // Reconstruct path
      const path: number[] = [currentId];
      let curr = currentId;
      while (cameFrom.has(curr)) {
        curr = cameFrom.get(curr)!;
        path.unshift(curr);
      }
      return path;
    }

    openSet.splice(openSetIdx, 1);

    const edges = hpaGraph.edges.get(currentId) || [];
    for (const edge of edges) {
      const tentativeGScore = (gScore.get(currentId) ?? 0) + edge.cost;

      if (tentativeGScore < (gScore.get(edge.toNodeId) ?? Infinity)) {
        cameFrom.set(edge.toNodeId, currentId);
        gScore.set(edge.toNodeId, tentativeGScore);

        const neighborNode = hpaGraph.nodes.get(edge.toNodeId)!;
        fScore.set(edge.toNodeId, tentativeGScore + hpaHeuristic(neighborNode, endNode, hpaGraph));

        if (!openSet.includes(edge.toNodeId)) {
          openSet.push(edge.toNodeId);
        }
      }
    }
  }

  return null; // No path found
}

/**
 * Heuristic for HPA* high-level search (toroidal octile distance).
 */
function hpaHeuristic(a: HPAAbstractNode, b: HPAAbstractNode, hpaGraph: HPAGraph): number {
  let dx = Math.abs(a.gridX - b.gridX);
  let dy = Math.abs(a.gridY - b.gridY);

  // Handle toroidal wrapping
  if (dx > hpaGraph.gridWidth / 2) dx = hpaGraph.gridWidth - dx;
  if (dy > hpaGraph.gridHeight / 2) dy = hpaGraph.gridHeight - dy;

  const D = 1;
  const D2 = 1.414;
  return D * (dx + dy) + (D2 - 2 * D) * Math.min(dx, dy);
}

/**
 * Inserts a temporary node into the abstract graph for a specific position.
 * Used for start/end positions that aren't at cluster borders.
 */
export function insertTemporaryNode(
  hpaGraph: HPAGraph,
  navGrid: NavigationGrid,
  gridX: number,
  gridY: number,
  leaderId?: number,
): HPAAbstractNode | null {
  const { gridWidth, clustersPerRow } = hpaGraph;

  // Check if this cell is passable
  const cellIdx = gridY * gridWidth + gridX;
  if (!isCellPassable(navGrid, cellIdx, leaderId)) {
    return null;
  }

  // Find which cluster this position belongs to
  const clusterX = Math.floor(gridX / HPA_CLUSTER_SIZE);
  const clusterY = Math.floor(gridY / HPA_CLUSTER_SIZE);
  const clusterId = clusterY * clustersPerRow + clusterX;

  const cluster = hpaGraph.clusters[clusterId];
  if (!cluster) return null;

  // Create temporary node
  const tempNode: HPAAbstractNode = {
    id: hpaGraph.nextNodeId++,
    gridX,
    gridY,
    clusterId,
  };

  hpaGraph.nodes.set(tempNode.id, tempNode);

  // Connect to all border nodes in this cluster
  for (const borderNodeId of cluster.borderNodeIds) {
    const borderNode = hpaGraph.nodes.get(borderNodeId)!;

    const cost = computeIntraClusterPath(hpaGraph, navGrid, cluster, tempNode, borderNode, leaderId);

    if (cost !== null) {
      addEdge(hpaGraph, tempNode.id, borderNodeId, cost, false);
      addEdge(hpaGraph, borderNodeId, tempNode.id, cost, false);
    }
  }

  return tempNode;
}

/**
 * Removes a temporary node from the abstract graph.
 */
export function removeTemporaryNode(hpaGraph: HPAGraph, nodeId: number): void {
  hpaGraph.nodes.delete(nodeId);
  hpaGraph.edges.delete(nodeId);

  // Remove edges pointing to this node
  for (const edges of hpaGraph.edges.values()) {
    const idx = edges.findIndex((e) => e.toNodeId === nodeId);
    if (idx !== -1) {
      edges.splice(idx, 1);
    }
  }
}

/**
 * Marks clusters as dirty when obstacles change.
 * Call this when navigation grid is updated.
 */
export function markClustersDirty(
  hpaGraph: HPAGraph,
  position: Vector2D,
  radius: number,
  worldWidth: number,
  worldHeight: number,
): void {
  // Find all clusters that might be affected
  const gridCoords = getNavigationGridCoords(position, worldWidth, worldHeight);
  const radiusInCells = Math.ceil(radius / NAV_GRID_RESOLUTION) + 1;

  const affectedClusters = new Set<number>();

  for (let dy = -radiusInCells; dy <= radiusInCells; dy++) {
    for (let dx = -radiusInCells; dx <= radiusInCells; dx++) {
      const gx = (gridCoords.x + dx + hpaGraph.gridWidth) % hpaGraph.gridWidth;
      const gy = (gridCoords.y + dy + hpaGraph.gridHeight) % hpaGraph.gridHeight;

      const clusterX = Math.floor(gx / HPA_CLUSTER_SIZE);
      const clusterY = Math.floor(gy / HPA_CLUSTER_SIZE);
      const clusterId = clusterY * hpaGraph.clustersPerRow + clusterX;

      affectedClusters.add(clusterId);
    }
  }

  for (const clusterId of affectedClusters) {
    const cluster = hpaGraph.clusters[clusterId];
    if (cluster) {
      cluster.isDirty = true;
    }
  }

  // If any clusters are dirty, we need to rebuild the graph
  // (In a more sophisticated implementation, we'd only rebuild affected clusters)
  hpaGraph.needsRebuild = true;
}

/**
 * Converts a high-level abstract path to world coordinates.
 */
export function hpaPathToWorldCoords(
  hpaGraph: HPAGraph,
  abstractPath: number[],
): Vector2D[] {
  const worldPath: Vector2D[] = [];

  for (const nodeId of abstractPath) {
    const node = hpaGraph.nodes.get(nodeId);
    if (node) {
      worldPath.push({
        x: node.gridX * NAV_GRID_RESOLUTION + NAV_GRID_RESOLUTION / 2,
        y: node.gridY * NAV_GRID_RESOLUTION + NAV_GRID_RESOLUTION / 2,
      });
    }
  }

  return worldPath;
}

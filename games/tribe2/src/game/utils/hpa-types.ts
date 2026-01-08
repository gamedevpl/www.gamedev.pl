/**
 * HPA* (Hierarchical Pathfinding A*) type definitions.
 *
 * This module provides hierarchical pathfinding for improved performance
 * on large navigation grids. The grid is divided into clusters, with
 * abstract nodes placed at cluster borders for high-level pathfinding.
 */

import { Vector2D } from './math-types';

/**
 * Size of each cluster in grid cells.
 * A cluster is a square region of the navigation grid.
 */
export const HPA_CLUSTER_SIZE = 10;

/**
 * Maximum number of entrances (border transitions) per cluster edge.
 * Limits memory usage while maintaining path quality.
 */
export const HPA_MAX_ENTRANCES_PER_EDGE = 3;

/**
 * Represents a single abstract node at a cluster border.
 * These nodes form the vertices of the abstract graph.
 */
export interface HPAAbstractNode {
  /** Unique identifier for this node */
  id: number;
  /** Grid coordinates (in cell units) */
  gridX: number;
  gridY: number;
  /** Which cluster this node belongs to (clusterY * clustersPerRow + clusterX) */
  clusterId: number;
}

/**
 * Represents an edge in the abstract graph.
 * Edges connect abstract nodes either within a cluster (intra-edge)
 * or between adjacent clusters (inter-edge).
 */
export interface HPAAbstractEdge {
  /** Source node ID */
  fromNodeId: number;
  /** Target node ID */
  toNodeId: number;
  /** Distance cost of this edge */
  cost: number;
  /** Whether this is an inter-cluster edge (crosses cluster boundary) */
  isInterEdge: boolean;
}

/**
 * Represents a cluster (rectangular region) of the navigation grid.
 */
export interface HPACluster {
  /** Cluster ID (clusterY * clustersPerRow + clusterX) */
  id: number;
  /** Cluster coordinates */
  clusterX: number;
  clusterY: number;
  /** Top-left grid cell coordinates */
  gridStartX: number;
  gridStartY: number;
  /** Abstract node IDs at the borders of this cluster */
  borderNodeIds: number[];
  /** Whether this cluster needs recomputation of internal paths */
  isDirty: boolean;
}

/**
 * The HPA* abstract graph structure.
 * Contains the hierarchical representation of the navigation grid.
 */
export interface HPAGraph {
  /** All abstract nodes indexed by ID */
  nodes: Map<number, HPAAbstractNode>;
  /** Adjacency list: node ID -> list of edges from that node */
  edges: Map<number, HPAAbstractEdge[]>;
  /** All clusters */
  clusters: HPACluster[];
  /** Number of clusters per row */
  clustersPerRow: number;
  /** Number of clusters per column */
  clustersPerCol: number;
  /** Grid width in cells */
  gridWidth: number;
  /** Grid height in cells */
  gridHeight: number;
  /** Next available node ID */
  nextNodeId: number;
  /** Cache of intra-cluster paths: `${fromNodeId}-${toNodeId}` -> path cost */
  intraClusterPathCache: Map<string, number>;
  /** Whether the entire graph needs rebuilding */
  needsRebuild: boolean;
}

/**
 * Result of an HPA* pathfinding query.
 */
export interface HPAPathResult {
  /** The path in world coordinates, or null if no path found */
  path: Vector2D[] | null;
  /** Number of abstract graph nodes expanded */
  nodesExpanded: number;
  /** Whether a cached result was used */
  usedCache: boolean;
}

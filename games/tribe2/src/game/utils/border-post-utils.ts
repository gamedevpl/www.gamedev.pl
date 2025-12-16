/**
 * Utility functions for evaluating and scoring border post placement quality.
 * These functions help the AI make intelligent decisions about where to place
 * border posts and which existing posts should be removed if they are inferior.
 */

import { Vector2D } from './math-types';
import { BuildingEntity, BuildingType } from '../entities/buildings/building-types';
import { GameWorldState } from '../world-types';
import { calculateWrappedDistance } from './math-utils';
import { TERRITORY_BUILDING_RADIUS } from '../entities/tribe/territory-consts';
import {
  BORDER_POST_OPTIMAL_SPACING,
  BORDER_POST_MAX_USEFUL_DISTANCE,
  BORDER_POST_REPLACEMENT_THRESHOLD,
} from '../ai-consts';

/**
 * Finds the distance to the nearest border post from a given position.
 * @param position The position to check from
 * @param borderPosts Array of border post buildings
 * @param gameState The current game state
 * @returns Distance to nearest border post, or Infinity if no posts exist
 */
function findNearestBorderPost(position: Vector2D, borderPosts: BuildingEntity[], gameState: GameWorldState): number {
  if (borderPosts.length === 0) {
    return Infinity;
  }

  let minDistance = Infinity;
  const { width, height } = gameState.mapDimensions;

  for (const post of borderPosts) {
    const distance = calculateWrappedDistance(position, post.position, width, height);
    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  return minDistance;
}

/**
 * Calculates how much unique territory area a position would cover.
 * This considers overlap with existing border posts to determine the
 * incremental value of placing a post at this position.
 * @param position The position to evaluate
 * @param borderPosts Array of existing border post buildings
 * @param gameState The current game state
 * @returns Unique coverage area (0 to PI * radius^2)
 */
function calculateUniqueCoverage(position: Vector2D, borderPosts: BuildingEntity[], gameState: GameWorldState): number {
  const { width, height } = gameState.mapDimensions;
  const radius = TERRITORY_BUILDING_RADIUS;
  const maxCoverage = Math.PI * radius * radius;

  // If no existing posts, this position covers the full area
  if (borderPosts.length === 0) {
    return maxCoverage;
  }

  // Calculate overlap with existing posts
  // This is a simplified approximation - we check how many existing posts
  // are within 2*radius distance and reduce coverage accordingly
  let overlapFactor = 0;

  for (const post of borderPosts) {
    const distance = calculateWrappedDistance(position, post.position, width, height);

    // If posts overlap significantly, reduce coverage
    if (distance < radius * 2) {
      // Calculate overlap ratio (0 = no overlap, 1 = complete overlap)
      const overlapRatio = Math.max(0, 1 - distance / (radius * 2));
      overlapFactor += overlapRatio;
    }
  }

  // Clamp overlap factor to [0, 1]
  overlapFactor = Math.min(1, overlapFactor);

  // Return coverage reduced by overlap
  return maxCoverage * (1 - overlapFactor);
}

/**
 * Calculates a quality score for a border post position.
 * The score ranges from 0-100 and is based on four weighted factors:
 * - Isolation (40%): Distance to nearest other border post
 * - Expansion (30%): Distance from tribe center (bell curve)
 * - Coverage (20%): Unique territory coverage contribution
 * - Strategic (10%): Proximity to other tribe buildings
 *
 * @param position The position to evaluate (or existing post position)
 * @param allBorderPosts All border posts of the tribe (excluding the one being scored if applicable)
 * @param tribeCenter The center position of the tribe
 * @param allTribeBuildings All buildings owned by the tribe
 * @param gameState The current game state
 * @returns Quality score from 0-100
 */
export function scoreBorderPost(
  position: Vector2D,
  allBorderPosts: BuildingEntity[],
  tribeCenter: Vector2D,
  allTribeBuildings: BuildingEntity[],
  gameState: GameWorldState,
): number {
  const { width, height } = gameState.mapDimensions;

  // 1. Isolation Score (40 points max)
  // Higher score for posts that are well-spaced from other border posts
  const nearestPostDistance = findNearestBorderPost(position, allBorderPosts, gameState);
  const isolationScore = Math.min(nearestPostDistance / BORDER_POST_OPTIMAL_SPACING, 1.0) * 40;

  // 2. Expansion Score (30 points max)
  // Bell curve: optimal distance is 60% of max useful distance
  // Too close to center or too far out both reduce score
  const distanceFromCenter = calculateWrappedDistance(position, tribeCenter, width, height);
  const optimalDistance = BORDER_POST_MAX_USEFUL_DISTANCE * 0.6;

  let expansionScore: number;
  if (distanceFromCenter > BORDER_POST_MAX_USEFUL_DISTANCE) {
    // Too far out, score drops to 0
    expansionScore = 0;
  } else {
    // Bell curve calculation
    const deviation = Math.abs(distanceFromCenter - optimalDistance) / optimalDistance;
    expansionScore = (1 - Math.min(deviation, 1)) * 30;
  }

  // 3. Coverage Score (20 points max)
  // Higher score for positions that add unique territory coverage
  const uniqueCoverage = calculateUniqueCoverage(position, allBorderPosts, gameState);
  const maxCoverage = Math.PI * TERRITORY_BUILDING_RADIUS * TERRITORY_BUILDING_RADIUS;
  const coverageScore = (uniqueCoverage / maxCoverage) * 20;

  // 4. Strategic Score (10 points max)
  // Higher score for posts near other tribe buildings (defensive positioning)
  const nonBorderBuildings = allTribeBuildings.filter((b) => b.buildingType !== BuildingType.BorderPost);

  let strategicScore = 0;
  if (nonBorderBuildings.length > 0) {
    let minDistanceToBuilding = Infinity;

    for (const building of nonBorderBuildings) {
      const distance = calculateWrappedDistance(position, building.position, width, height);
      if (distance < minDistanceToBuilding) {
        minDistanceToBuilding = distance;
      }
    }

    // Score based on proximity - higher score if within 300px of a building
    if (minDistanceToBuilding <= 300) {
      strategicScore = (1 - minDistanceToBuilding / 300) * 10;
    }
  }

  // Total score
  const totalScore = isolationScore + expansionScore + coverageScore + strategicScore;

  return Math.round(totalScore * 100) / 100; // Round to 2 decimal places
}

/**
 * Finds the weakest (lowest scoring) border post in a tribe's territory.
 * @param borderPosts Array of border post buildings to evaluate
 * @param tribeCenter The center position of the tribe
 * @param allTribeBuildings All buildings owned by the tribe
 * @param gameState The current game state
 * @returns The weakest post and its score, or undefined if no posts exist
 */
export function findWeakestBorderPost(
  borderPosts: BuildingEntity[],
  tribeCenter: Vector2D,
  allTribeBuildings: BuildingEntity[],
  gameState: GameWorldState,
): { post: BuildingEntity; score: number } | undefined {
  if (borderPosts.length === 0) {
    return undefined;
  }

  let weakestPost: BuildingEntity | undefined;
  let lowestScore = Infinity;

  for (const post of borderPosts) {
    // Score this post, excluding it from the allBorderPosts array to avoid self-comparison
    const otherPosts = borderPosts.filter((p) => p.id !== post.id);
    const score = scoreBorderPost(post.position, otherPosts, tribeCenter, allTribeBuildings, gameState);

    if (score < lowestScore) {
      lowestScore = score;
      weakestPost = post;
    }
  }

  return weakestPost ? { post: weakestPost, score: lowestScore } : undefined;
}

/**
 * Determines if a new border post position is significantly better than
 * the weakest existing post, justifying replacement.
 * @param weakestScore The score of the weakest existing post
 * @param newPositionScore The score of the proposed new position
 * @returns True if the new position is significantly better (exceeds threshold)
 */
export function shouldReplaceBorderPost(weakestScore: number, newPositionScore: number): boolean {
  const improvement = newPositionScore - weakestScore;

  return improvement >= BORDER_POST_REPLACEMENT_THRESHOLD;
}

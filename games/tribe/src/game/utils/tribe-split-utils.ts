import {
  NOTIFICATION_DURATION_LONG_HOURS
} from '../notification-consts.ts';
import {
  TRIBE_SPLIT_MIN_FAMILY_HEADCOUNT_PERCENTAGE,
  TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT,
  TRIBE_SPLIT_MOVE_AWAY_DISTANCE
} from '../tribe-consts.ts';
import { HumanEntity } from '../entities/characters/human/human-types';
import { NotificationType } from '../notifications/notification-types';
import { addNotification } from '../notifications/notification-utils';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { DiplomacyStatus, GameWorldState, UpdateContext } from '../world-types';
import { calculateWrappedDistance } from './math-utils';
import { Vector2D } from './math-types';
import { findChildren, findDescendants, findHeir, findTribeMembers } from './family-tribe-utils';
import { generateTribeBadge } from './general-utils';
import { getRandomNearbyPosition, isPositionOccupied } from './spatial-utils';

export function findSafeTribeSplitLocation(
  originalTribeCenter: Vector2D,
  human: HumanEntity,
  gameState: GameWorldState,
): Vector2D | null {
  const worldWidth = gameState.mapDimensions.width;
  const worldHeight = gameState.mapDimensions.height;
  const checkRadius = human.radius * 2; // Clearance needed for the spot

  // Start searching from the minimum distance and expand outwards
  for (let r = TRIBE_SPLIT_MOVE_AWAY_DISTANCE; r < worldWidth / 2; r += 50) {
    // Try a few random positions at this radius
    for (let i = 0; i < 10; i++) {
      const spot = getRandomNearbyPosition(originalTribeCenter, r, worldWidth, worldHeight);

      // Check if the spot is far enough from the center
      const distanceFromCenter = calculateWrappedDistance(originalTribeCenter, spot, worldWidth, worldHeight);

      if (distanceFromCenter < TRIBE_SPLIT_MOVE_AWAY_DISTANCE) {
        continue; // Not far enough, try another spot
      }

      if (!isPositionOccupied(spot, gameState, checkRadius, human.id)) {
        return spot; // Found a safe and unoccupied spot
      }
    }
  }

  return null; // No suitable location found
}

export function canSplitTribe(human: HumanEntity, gameState: GameWorldState): { canSplit: boolean; progress?: number } {
  if (!human.isAdult || human.gender !== 'male' || human.leaderId === human.id || !human.leaderId) {
    return { canSplit: false };
  }

  if (!human.leaderId) {
    return { canSplit: false }; // Not in a tribe, can't split
  }

  const leader = gameState.entities.entities.get(human.leaderId) as HumanEntity | undefined;
  if (!leader || leader.type !== 'human') {
    return { canSplit: false }; // Leader is not a human or doesn't exist
  }

  const heir = findHeir(findChildren(gameState, leader));
  if (heir && heir.id === human.id) {
    return { canSplit: false }; // The human is already the heir, no need to split
  }

  const currentTribeMembers = findTribeMembers(human.leaderId, gameState);
  if (currentTribeMembers.length < TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT) {
    return { canSplit: false };
  }

  const descendants = findDescendants(human, gameState);
  const familySize = descendants.length + 1; // +1 for the leader himself

  const requiredSize = Math.min(
    currentTribeMembers.length * TRIBE_SPLIT_MIN_FAMILY_HEADCOUNT_PERCENTAGE,
    TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT,
  );

  return { canSplit: familySize >= requiredSize, progress: familySize / requiredSize };
}

export function performTribeSplit(human: HumanEntity, gameState: GameWorldState): void {
  if (!canSplitTribe(human, gameState).canSplit) {
    return;
  }

  const previousLeader = human.leaderId
    ? (gameState.entities.entities.get(human.leaderId) as HumanEntity | undefined)
    : undefined;

  const newTribeBadge = generateTribeBadge();
  const descendants = findDescendants(human, gameState);

  // The founder becomes the new leader
  human.leaderId = human.id;
  human.tribeBadge = newTribeBadge;
  human.diplomacy = new Map();
  if (previousLeader) {
    previousLeader.diplomacy?.set(human.id, DiplomacyStatus.Hostile);
  }

  // Update all descendants
  for (const descendant of descendants) {
    descendant.leaderId = human.id;
    descendant.tribeBadge = newTribeBadge;
  }

  // Add notification
  addNotification(gameState, {
    type: NotificationType.NewTribeFormed,
    message: `A new tribe has formed! ${newTribeBadge}`,
    duration: NOTIFICATION_DURATION_LONG_HOURS,
    targetEntityIds: [human.id],
    highlightedEntityIds: [human.id, ...descendants.map((d) => d.id)],
  });

  // Play sound
  const updateContext: UpdateContext = { gameState, deltaTime: 0 };
  playSoundAt(updateContext, SoundType.TribeSplit, human.position);
}

export function propagateNewLeaderToDescendants(
  newLeader: HumanEntity,
  human: HumanEntity,
  gameState: GameWorldState,
): void {
  human.leaderId = newLeader.id; // Set the new leader for this human
  human.tribeBadge = newLeader.tribeBadge; // Update tribe badge to match new leader

  // Recursively propagate to children
  if (human.gender === 'male') {
    findChildren(gameState, human).forEach((child) => {
      propagateNewLeaderToDescendants(newLeader, child, gameState);
      if (child.motherId && human.partnerIds?.includes(child.motherId)) {
        // If the child is from the same family, propagate to the mother as long as she is currently partnered with the father
        const mother = gameState.entities.entities.get(child.motherId) as HumanEntity | undefined;
        if (mother) {
          mother.leaderId = newLeader.id; // Set the new leader for the mother
          mother.tribeBadge = newLeader.tribeBadge; // Update tribe badge to match new leader
        }
      }
    });
  }
}

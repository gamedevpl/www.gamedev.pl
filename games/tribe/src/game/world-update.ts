import {
  GameWorldState,
  Character,
  BerryBush,
  Position,
  HOURS_PER_GAME_DAY,
  GAME_DAY_IN_REAL_SECONDS,
  CHILD_TO_ADULT_AGE_YEARS,
  MAX_HUNGER,
  HUNGER_INCREASE_PER_HOUR,
  MAX_AGE_YEARS,
  BERRY_REGEN_PER_DAY,
  NPC_SEEK_FOOD_HUNGER_THRESHOLD,
  NPC_EAT_FOOD_HUNGER_THRESHOLD,
  PLAYER_MAX_INVENTORY,
  BERRY_NUTRITION,
  INTERACTION_RANGE,
  BASE_SPEED_PIXELS_PER_SECOND,
  HUNGER_SPEED_MULTIPLIER,
  HUNGER_MOVEMENT_THRESHOLD,
  MAP_WIDTH,
  MAP_HEIGHT,
} from './world-types';
import { v4 as uuidv4 } from 'uuid'; // Assuming uuid is available for unique IDs

/**
 * Creates a deep copy of the game state.
 * Note: structuredClone is a modern approach. For wider compatibility, a library or custom function might be needed.
 */
function deepCloneState(state: GameWorldState): GameWorldState {
  return structuredClone(state);
}

/**
 * Calculate Euclidean distance between two positions.
 */
function distance(pos1: Position, pos2: Position): number {
  return Math.sqrt((pos1.x - pos2.x) ** 2 + (pos1.y - pos2.y) ** 2);
}

/**
 * Find the nearest available berry bush to a character.
 * Returns null if no bush with berries is available.
 */
function findNearestAvailableBush(character: Character, bushes: BerryBush[]): BerryBush | null {
  let nearestBush: BerryBush | null = null;
  let nearestDistance = Infinity;

  for (const bush of bushes) {
    if (bush.berriesAvailable > 0) {
      const dist = distance(character.position, bush.position);
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestBush = bush;
      }
    }
  }

  return nearestBush;
}

/**
 * Updates the game world state based on the elapsed time delta.
 * This function handles aging, hunger, procreation (births), resource regeneration, and death.
 *
 * @param currentState The current state of the game world.
 * @param realDeltaTimeSeconds The amount of real time that has passed, in seconds.
 * @returns The new game world state after the update.
 */
export function updateWorld(currentState: GameWorldState, realDeltaTimeSeconds: number): GameWorldState {
  const newState = deepCloneState(currentState);

  if (newState.gameOver) {
    return newState;
  }

  const gameHoursDelta = realDeltaTimeSeconds * (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS);
  newState.time += gameHoursDelta;

  // Character Updates
  const newCharacters: Character[] = [];
  for (const character of newState.characters) {
    if (!character.isAlive) {
      newCharacters.push(character); // Keep dead characters for records/potential future features
      continue;
    }

    // Aging
    character.age += gameHoursDelta / HOURS_PER_GAME_DAY / 365.0;
    if (character.type === 'child' && character.age >= CHILD_TO_ADULT_AGE_YEARS) {
      character.type = 'partner'; // Promote to partner, player type is assigned on succession
    }

    // Hunger
    // TODO: Implement GDD rule: "If parents have no berries, the child's hunger increases at a faster rate than an adult's."
    // This requires checking parent inventory, which is complex if parents are not directly linked or accessible here easily.
    // For MVP, all characters (including children) might have the same hunger increase rate.
    character.hunger += HUNGER_INCREASE_PER_HOUR * gameHoursDelta;
    character.hunger = Math.max(0, Math.min(character.hunger, MAX_HUNGER));

    // Death by Hunger
    if (character.hunger >= MAX_HUNGER) {
      character.isAlive = false;
      character.causeOfDeath = 'hunger';
    }

    // Death by Old Age
    if (character.age >= MAX_AGE_YEARS) {
      character.isAlive = false;
      character.causeOfDeath = 'oldAge';
    }

    // Gestation & Birth
    if (
      character.gender === 'female' &&
      character.gestationEndsAtGameTime &&
      newState.time >= character.gestationEndsAtGameTime
    ) {
      const father = newState.characters.find((c) => c.id === character.fatherId); // Assuming fatherId is set during procreation
      const newChild: Character = {
        id: uuidv4(),
        type: 'child',
        gender: Math.random() < 0.5 ? 'male' : 'female',
        age: 0,
        hunger: 50, // Initial hunger for a newborn
        position: { ...character.position }, // Born at mother's position
        inventory: 0,
        isAlive: true,
        procreationCooldownEndsAtGameTime: 0,
        motherId: character.id,
        fatherId: father?.id, // May need to ensure fatherId is always set if procreation logic implies it
        causeOfDeath: 'none',
        currentAction: 'idle', // Initialize NPC action
      };
      newCharacters.push(newChild);
      character.gestationEndsAtGameTime = undefined; // Clear gestation
    }

    // NPC AI Logic for adult NPCs (partners)
    if (character.isAlive && character.id !== newState.currentPlayerId && character.type === 'partner') {
      // Initialize currentAction if not set
      if (!character.currentAction) {
        character.currentAction = 'idle';
      }

      // Eating Logic: If hungry enough and has berries, eat one
      if (character.hunger > NPC_EAT_FOOD_HUNGER_THRESHOLD && character.inventory > 0) {
        character.inventory--;
        character.hunger = Math.max(0, character.hunger - BERRY_NUTRITION);
        character.currentAction = 'eatingBerry';
      }
      // Food Seeking & Collection Logic
      else if (character.hunger > NPC_SEEK_FOOD_HUNGER_THRESHOLD && character.inventory < PLAYER_MAX_INVENTORY) {
        // If not currently moving to a bush or target is invalid, find a new target
        if (
          character.currentAction !== 'movingToBush' ||
          !character.targetBushId ||
          !character.targetPosition ||
          !newState.berryBushes.find((b) => b.id === character.targetBushId && b.berriesAvailable > 0)
        ) {
          const nearestBush = findNearestAvailableBush(character, newState.berryBushes);
          if (nearestBush) {
            character.targetBushId = nearestBush.id;
            character.targetPosition = { ...nearestBush.position };
            character.currentAction = 'movingToBush';
          } else {
            character.currentAction = 'idle';
            character.targetBushId = undefined;
            character.targetPosition = undefined;
          }
        }

        // If moving to bush and target is valid
        if (character.currentAction === 'movingToBush' && character.targetPosition && character.targetBushId) {
          const targetBush = newState.berryBushes.find((b) => b.id === character.targetBushId);

          // Check if target bush is still valid
          if (!targetBush || targetBush.berriesAvailable <= 0) {
            character.currentAction = 'idle';
            character.targetBushId = undefined;
            character.targetPosition = undefined;
          } else {
            const distanceToBush = distance(character.position, character.targetPosition);

            // If at the bush (within interaction range)
            if (distanceToBush < INTERACTION_RANGE) {
              if (character.inventory < PLAYER_MAX_INVENTORY && targetBush.berriesAvailable > 0) {
                // Collect berry
                targetBush.berriesAvailable--;
                character.inventory++;
                character.currentAction = 'collectingBerry';
                // Reset to idle after collecting
                character.currentAction = 'idle';
                character.targetBushId = undefined;
                character.targetPosition = undefined;
              } else {
                // Cannot collect (inventory full or no berries)
                character.currentAction = 'idle';
                character.targetBushId = undefined;
                character.targetPosition = undefined;
              }
            } else {
              // Move towards the bush
              const dx = character.targetPosition.x - character.position.x;
              const dy = character.targetPosition.y - character.position.y;
              const moveDistance = Math.sqrt(dx * dx + dy * dy);

              if (moveDistance > 0) {
                // Normalize direction
                const moveX = dx / moveDistance;
                const moveY = dy / moveDistance;

                // Calculate speed (apply hunger modifier if needed)
                let speed = BASE_SPEED_PIXELS_PER_SECOND;
                if (character.hunger > HUNGER_MOVEMENT_THRESHOLD) {
                  speed *= HUNGER_SPEED_MULTIPLIER;
                }

                // Update position
                const moveAmount = speed * realDeltaTimeSeconds;
                character.position.x += moveX * moveAmount;
                character.position.y += moveY * moveAmount;

                // Apply world wrapping
                character.position.x = (character.position.x + MAP_WIDTH) % MAP_WIDTH;
                character.position.y = (character.position.y + MAP_HEIGHT) % MAP_HEIGHT;
                if (character.position.x < 0) character.position.x += MAP_WIDTH;
                if (character.position.y < 0) character.position.y += MAP_HEIGHT;
              }
            }
          }
        }
      } else {
        // Not hungry enough to seek food or inventory is full
        character.currentAction = 'idle';
        character.targetBushId = undefined;
        character.targetPosition = undefined;
      }
    }

    newCharacters.push(character);
  }
  newState.characters = newCharacters;

  // Berry Bush Updates
  for (const bush of newState.berryBushes) {
    if (bush.berriesAvailable < bush.maxBerries) {
      bush.regenerationProgressHours += gameHoursDelta;
      if (bush.regenerationProgressHours >= HOURS_PER_GAME_DAY / BERRY_REGEN_PER_DAY) {
        bush.berriesAvailable++;
        bush.regenerationProgressHours = 0; // Reset progress
      }
    }
  }

  // Handle Current Player Death & Generational Transfer
  const currentPlayer = newState.characters.find((c) => c.id === newState.currentPlayerId);

  if (newState.currentPlayerId && currentPlayer && !currentPlayer.isAlive) {
    const livingOffspring = newState.characters.filter(
      (c) => c.isAlive && (c.motherId === newState.currentPlayerId || c.fatherId === newState.currentPlayerId),
    );

    if (livingOffspring.length > 0) {
      livingOffspring.sort((a, b) => b.age - a.age); // Sort by age, descending (oldest first)
      const heir = livingOffspring[0];
      newState.currentPlayerId = heir.id;
      // If heir was a child and now becomes player, their type might need adjustment if player interactions differ
      // For now, the 'player' type is mainly a tag for control, and 'partner' for adult non-player.
      // If the heir is a child who just became adult in this same tick, type would be 'partner'.
      // If still a child, they become a child player. GDD implies control transfers regardless of age if they are the oldest.
      // The GDD states "seamlessly transition control to the next generation (oldest offspring)".

      // // It also says "If a character reaches maximum age and has no living offspring, it results in a game over".
      // This implies children can inherit.

      if (
        newState.characters.find((c) => c.id === heir.id)!.type === 'child' &&
        newState.characters.find((c) => c.id === heir.id)!.age < CHILD_TO_ADULT_AGE_YEARS
      ) {
        // Player is a child, this is fine by GDD.
      } else {
        newState.characters.find((c) => c.id === heir.id)!.type = 'player'; // Or ensure it's marked as player if it was 'partner'
      }
      newState.generationCount++;
    } else {
      newState.gameOver = true;
      newState.causeOfGameOver = `Lineage Extinct: Player died of ${currentPlayer.causeOfDeath || 'unknown reasons'}.`;
      newState.currentPlayerId = null;
    }
  }

  return newState;
}

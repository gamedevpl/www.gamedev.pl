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
  CHILD_HUNGER_INCREASE_MULTIPLIER, // Added import
  BERRY_NUTRITION, // Added import
  MAX_AGE_YEARS,
  BERRY_REGEN_PER_DAY,
  NPC_SEEK_FOOD_HUNGER_THRESHOLD,
  NPC_EAT_FOOD_HUNGER_THRESHOLD,
  PLAYER_MAX_INVENTORY,
  INTERACTION_RANGE,
  BASE_SPEED_PIXELS_PER_SECOND,
  HUNGER_SPEED_MULTIPLIER,
  HUNGER_MOVEMENT_THRESHOLD,
  MAP_WIDTH,
  MAP_HEIGHT,
  HUNGER_PROCREATION_THRESHOLD,
  REAL_SECONDS_PER_GAME_YEAR,
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
    character.age += realDeltaTimeSeconds / REAL_SECONDS_PER_GAME_YEAR;
    if (character.type === 'child' && character.age >= CHILD_TO_ADULT_AGE_YEARS) {
      character.type = 'partner'; // Promote to partner, player type is assigned on succession
    }

    // Hunger Logic
    let fedThisTick = false;
    if (character.type === 'child') {
      const mother = newState.characters.find(
        (c) => c.id === character.motherId && c.isAlive && c.inventory > 0,
      );
      const father = newState.characters.find(
        (c) => c.id === character.fatherId && c.isAlive && c.inventory > 0,
      );

      let parentWhoFed: Character | undefined = undefined;

      if (mother) {
        parentWhoFed = mother;
      } else if (father) {
        parentWhoFed = father;
      }

      if (parentWhoFed) {
        parentWhoFed.inventory--;
        character.hunger = Math.max(0, character.hunger - BERRY_NUTRITION);
        fedThisTick = true;
      }
    }

    // Hunger accumulation
    if (character.type === 'child') {
      if (!fedThisTick) {
        character.hunger += HUNGER_INCREASE_PER_HOUR * CHILD_HUNGER_INCREASE_MULTIPLIER * gameHoursDelta;
      }
      // If fedThisTick is true, hunger was already reduced, and we assume feeding covers the hunger for this tick.
    } else {
      // Adult hunger increase
      character.hunger += HUNGER_INCREASE_PER_HOUR * gameHoursDelta;
    }
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

    // Apply velocity to position
    character.position.x =
      (character.position.x + character.velocity.x * realDeltaTimeSeconds + MAP_WIDTH) % MAP_WIDTH;
    character.position.y =
      (character.position.y + character.velocity.y * realDeltaTimeSeconds + MAP_HEIGHT) % MAP_HEIGHT;
    // Ensure positive result for modulo with negative numbers
    if (character.position.x < 0) character.position.x += MAP_WIDTH;
    if (character.position.y < 0) character.position.y += MAP_HEIGHT;

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
        velocity: { x: 0, y: 0 }, // Initialize velocity
      };
      newCharacters.push(newChild);
      character.gestationEndsAtGameTime = undefined;
      character.gestationStartTime = undefined; // Clear gestation start time as well
    }

    // NPC AI Logic for adult NPCs (partners)
    if (
      character.isAlive &&
      character.id !== newState.currentPlayerId &&
      (character.type === 'partner' || character.type === 'player') // Ensure only adults perform these actions
    ) {
      // Initialize currentAction if not set
      if (!character.currentAction) {
        character.currentAction = 'idle';
      }

      // Eating Logic: If hungry enough and has berries, eat one
      if (character.hunger > NPC_EAT_FOOD_HUNGER_THRESHOLD && character.inventory > 0) {
        character.inventory--;
        character.hunger = Math.max(0, character.hunger - BERRY_NUTRITION);
        character.currentAction = 'eatingBerry';
        character.velocity = { x: 0, y: 0 }; // Stop moving while eating
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
            character.velocity = { x: 0, y: 0 };
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
            character.velocity = { x: 0, y: 0 };
          } else {
            const distanceToBush = distance(character.position, character.targetPosition);

            // If at the bush (within interaction range)
            if (distanceToBush < INTERACTION_RANGE) {
              if (character.inventory < PLAYER_MAX_INVENTORY && targetBush.berriesAvailable > 0) {
                // Collect berry
                targetBush.berriesAvailable--;
                character.inventory++;
                // Action becomes 'collectingBerry' briefly, then back to 'idle' or re-evaluate
                character.currentAction = 'collectingBerry';
                // Reset to idle after collecting to re-evaluate next action (e.g. eat or find more food)
                character.currentAction = 'idle';
                character.targetBushId = undefined;
                character.targetPosition = undefined;
                character.velocity = { x: 0, y: 0 }; // Stop moving
              } else {
                // Cannot collect (inventory full or no berries)
                character.currentAction = 'idle';
                character.targetBushId = undefined;
                character.targetPosition = undefined;
                character.velocity = { x: 0, y: 0 };
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
                character.velocity.x = moveX * speed;
                character.velocity.y = moveY * speed;
              }
            }
          }
        }
      } else {
        // Not hungry enough to seek food or inventory is full, or no bushes available
        character.currentAction = 'idle';
        character.targetBushId = undefined;
        character.targetPosition = undefined;
        character.velocity = { x: 0, y: 0 }; // Stop moving
      }
    }
    // If player character is not controlled by NPC logic, ensure velocity is not overridden here
    // unless specific player idle states also set velocity to 0 (handled by input or player-specific logic)

    newCharacters.push(character);
  }
  newState.characters = newCharacters;

  // Update player-controlled character's procreation initiation (moved from GameScreen)
  // This logic was previously in GameScreen's keydown handler for 'e'
  // It's better placed here or in a dedicated interaction system for consistency.
  // For now, let's assume an 'interact' intent is flagged on the player character if 'e' was pressed.
  // This part is a placeholder for where such interaction logic would be centralized.
  // The actual setting of gestationStartTime will be handled if procreation conditions are met.

  // Example of how procreation initiation might be triggered from a player action:
  // This is conceptual. The actual trigger comes from GameScreen's interaction logic.
  // The key part is setting gestationStartTime when procreation is successful.

  // Let's find the player and potential partner again to set gestationStartTime if procreation was successful.
  // This is a bit redundant if GameScreen already updated the state, but ensures it's set.
  // Ideally, GameScreen would pass an action/intent, and this `updateWorld` would process it.

  // Find the player character for interaction checks (conceptually)
  const playerCharacter = newState.characters.find((c) => c.id === newState.currentPlayerId && c.isAlive);

  if (playerCharacter /* && playerCharacter.interactionIntent === 'procreate' - conceptual */) {
    for (const partner of newState.characters) {
      if (
        partner.id !== playerCharacter.id &&
        partner.isAlive &&
        partner.type !== 'child' &&
        playerCharacter.type !== 'child' &&
        partner.gender !== playerCharacter.gender &&
        playerCharacter.age >= CHILD_TO_ADULT_AGE_YEARS &&
        partner.age >= CHILD_TO_ADULT_AGE_YEARS &&
        (!playerCharacter.procreationCooldownEndsAtGameTime ||
          newState.time >= playerCharacter.procreationCooldownEndsAtGameTime) &&
        (!partner.procreationCooldownEndsAtGameTime || newState.time >= partner.procreationCooldownEndsAtGameTime) &&
        playerCharacter.hunger < HUNGER_PROCREATION_THRESHOLD &&
        partner.hunger < HUNGER_PROCREATION_THRESHOLD &&
        distance(playerCharacter.position, partner.position) < INTERACTION_RANGE
      ) {
        // Check if gestation already started in this tick by GameScreen's direct manipulation
        // This logic primarily ensures gestationStartTime is set if procreation occurred.
        const female = playerCharacter.gender === 'female' ? playerCharacter : partner;
        if (female.gestationEndsAtGameTime && !female.gestationStartTime) {
          // If gestation just started
          female.gestationStartTime = newState.time; // Set start time
          // Cooldowns would have been set by GameScreen's interaction logic
        }
        // No need to break, GameScreen handles the single interaction event.
        // This block is more of a safeguard or could be part of a more centralized interaction system.
      }
    }
  }

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
      const heirCharacter = newState.characters.find((c) => c.id === heir.id)!; // Should always exist
      heirCharacter.type = 'player'; // Explicitly set the heir to type 'player'
      heirCharacter.velocity = { x: 0, y: 0 }; // Reset velocity for the new player

      newState.generationCount++;
    } else {
      newState.gameOver = true;
      newState.causeOfGameOver = `Lineage Extinct: Player died of ${currentPlayer.causeOfDeath ||
        'unknown reasons'}.`;
      newState.currentPlayerId = null;
    }
  }

  return newState;
}

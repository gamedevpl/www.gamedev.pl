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
  HUNGER_PROCREATION_THRESHOLD,
  CHILD_HUNGER_THRESHOLD_FOR_SEEKING_PARENT,
  CHILD_BASE_SPEED_PIXELS_PER_SECOND,
  CHILD_HUNGER_INCREASE_PER_HOUR,
  CHILD_PARENT_INTERACTION_RANGE,
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
      character.currentAction = 'idle'; // Reset action state upon becoming adult
      character.velocity = { x: 0, y: 0 };
    }

    // Hunger
    const hungerIncreaseRate = character.type === 'child' ? CHILD_HUNGER_INCREASE_PER_HOUR : HUNGER_INCREASE_PER_HOUR;
    if (character.type === 'child') {
      // Check if parents (if any exist and are alive) have berries
      // This simplified check assumes the player is the only one who can feed the child for now.
      // A more robust solution would check both parents if they exist and are alive.
      const mother = newState.characters.find((c) => c.id === character.motherId && c.isAlive);
      const father = newState.characters.find((c) => c.id === character.fatherId && c.isAlive);
      let parentsHaveBerries = false;
      if (mother && mother.inventory > 0) parentsHaveBerries = true;
      if (father && father.inventory > 0) parentsHaveBerries = true;
      // Player can also be a parent (if not the current child)
      const playerIsParentAndHasBerries = newState.characters.find(
        (c) =>
          c.id === newState.currentPlayerId &&
          (c.id === character.motherId || c.id === character.fatherId) &&
          c.inventory > 0,
      );
      if (playerIsParentAndHasBerries) parentsHaveBerries = true;

      // GDD: "If parents have no berries, the child's hunger increases at a faster rate than an adult's."
      // The request was for manual feeding. The current child hunger model applies a base CHILD_HUNGER_INCREASE_PER_HOUR.
      // Let's refine this: if no parent has berries AND the child is not being fed (which is implicit by parents not having berries for automatic sharing),
      // then increase hunger faster. For MVP manual feeding, this means child hunger is always at CHILD_HUNGER_INCREASE_PER_HOUR
      // unless we want to *further* penalize if parents *could* feed but don't. Let's stick to the defined child hunger rate for now,
      // as manual feeding is the primary mechanism.
      // The FASTER_HUNGER_RATE_FOR_UNFED_CHILD_MULTIPLIER can be used if we want to make it even harder.
      // For now, we'll use CHILD_HUNGER_INCREASE_PER_HOUR as the base for children.
    }
    character.hunger += hungerIncreaseRate * gameHoursDelta;
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
    character.position.x = (character.position.x + character.velocity.x * realDeltaTimeSeconds + MAP_WIDTH) % MAP_WIDTH;
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
        currentAction: 'childWandering', // Start wandering
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
      (character.type === 'partner' || (character.type === 'player' && character.id !== newState.currentPlayerId)) // Non-player controlled adults
    ) {
      if (!character.currentAction) {
        character.currentAction = 'idle';
      }

      if (character.hunger > NPC_EAT_FOOD_HUNGER_THRESHOLD && character.inventory > 0) {
        character.inventory--;
        character.hunger = Math.max(0, character.hunger - BERRY_NUTRITION);
        character.currentAction = 'eatingBerry';
        character.velocity = { x: 0, y: 0 };
      } else if (character.hunger > NPC_SEEK_FOOD_HUNGER_THRESHOLD && character.inventory < PLAYER_MAX_INVENTORY) {
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

        if (character.currentAction === 'movingToBush' && character.targetPosition && character.targetBushId) {
          const targetBush = newState.berryBushes.find((b) => b.id === character.targetBushId);
          if (!targetBush || targetBush.berriesAvailable <= 0) {
            character.currentAction = 'idle';
            character.velocity = { x: 0, y: 0 };
          } else {
            const distanceToBush = distance(character.position, character.targetPosition);
            if (distanceToBush < INTERACTION_RANGE) {
              if (character.inventory < PLAYER_MAX_INVENTORY && targetBush.berriesAvailable > 0) {
                targetBush.berriesAvailable--;
                character.inventory++;
                character.currentAction = 'idle'; // Re-evaluate: eat or seek more
                character.velocity = { x: 0, y: 0 };
              } else {
                character.currentAction = 'idle';
                character.velocity = { x: 0, y: 0 };
              }
            } else {
              const dx = character.targetPosition.x - character.position.x;
              const dy = character.targetPosition.y - character.position.y;
              const moveDistance = Math.sqrt(dx * dx + dy * dy);
              if (moveDistance > 0) {
                const moveX = dx / moveDistance;
                const moveY = dy / moveDistance;
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
        character.currentAction = 'idle';
        character.velocity = { x: 0, y: 0 };
      }
    } else if (character.isAlive && character.type === 'child') {
      // Child NPC AI Logic
      if (!character.currentAction) {
        character.currentAction = 'childWandering';
      }

      // If very hungry, try to find a parent (player or other adult of the lineage)
      if (character.hunger > CHILD_HUNGER_THRESHOLD_FOR_SEEKING_PARENT) {
        character.currentAction = 'childSeekingParentForFood';
        let closestParent: Character | null = null;
        let minDistanceToParent = Infinity;

        // Check mother, father, and current player if they are parents
        const potentialParents = newState.characters.filter(
          (p) =>
            p.isAlive &&
            (p.id === character.motherId || p.id === character.fatherId || p.id === newState.currentPlayerId) &&
            (p.id === character.motherId ||
              p.id === character.fatherId ||
              newState.characters.some((c) => (c.motherId === p.id || c.fatherId === p.id) && c.id === character.id)) && // ensure player is actual parent
            p.inventory > 0, // Parent must have food
        );

        for (const parent of potentialParents) {
          const dist = distance(character.position, parent.position);
          if (dist < minDistanceToParent) {
            minDistanceToParent = dist;
            closestParent = parent;
          }
        }

        if (closestParent) {
          character.targetPosition = { ...closestParent.position };
          const distanceToTarget = distance(character.position, character.targetPosition);
          if (distanceToTarget < CHILD_PARENT_INTERACTION_RANGE) {
            // Child is close enough, assumes parent will feed if player (handled by 'E' key)
            // Or if NPC parent, they might feed automatically (future enhancement)
            character.velocity = { x: 0, y: 0 }; // Stop near parent
            character.currentAction = 'idle'; // Wait for feeding or wander again if not fed
          } else {
            // Move towards parent
            const dx = character.targetPosition.x - character.position.x;
            const dy = character.targetPosition.y - character.position.y;
            const moveX = dx / distanceToTarget;
            const moveY = dy / distanceToTarget;
            character.velocity.x = moveX * CHILD_BASE_SPEED_PIXELS_PER_SECOND;
            character.velocity.y = moveY * CHILD_BASE_SPEED_PIXELS_PER_SECOND;
          }
        } else {
          // No parent with food found, continue wandering or a more desperate action
          character.currentAction = 'childWandering'; // Fallback to wandering
          character.targetPosition = undefined;
        }
      }

      if (character.currentAction === 'childWandering') {
        if (!character.targetPosition || distance(character.position, character.targetPosition) < INTERACTION_RANGE) {
          // Pick a new random target position for wandering
          character.targetPosition = {
            x: Math.random() * MAP_WIDTH,
            y: Math.random() * MAP_HEIGHT,
          };
        }
        const dx = character.targetPosition.x - character.position.x;
        const dy = character.targetPosition.y - character.position.y;
        const distanceToTarget = distance(character.position, character.targetPosition);
        if (distanceToTarget > 0) {
          const moveX = dx / distanceToTarget;
          const moveY = dy / distanceToTarget;
          character.velocity.x = moveX * CHILD_BASE_SPEED_PIXELS_PER_SECOND * 0.5; // Wander slowly
          character.velocity.y = moveY * CHILD_BASE_SPEED_PIXELS_PER_SECOND * 0.5;
        } else {
          character.velocity = { x: 0, y: 0 };
        }
      }
    }

    newCharacters.push(character);
  }
  newState.characters = newCharacters;

  const playerCharacter = newState.characters.find((c) => c.id === newState.currentPlayerId && c.isAlive);
  if (playerCharacter) {
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
        const female = playerCharacter.gender === 'female' ? playerCharacter : partner;
        if (female.gestationEndsAtGameTime && !female.gestationStartTime) {
          female.gestationStartTime = newState.time;
        }
      }
    }
  }

  for (const bush of newState.berryBushes) {
    if (bush.berriesAvailable < bush.maxBerries) {
      bush.regenerationProgressHours += gameHoursDelta;
      if (bush.regenerationProgressHours >= HOURS_PER_GAME_DAY / BERRY_REGEN_PER_DAY) {
        bush.berriesAvailable++;
        bush.regenerationProgressHours = 0;
      }
    }
  }

  const currentPlayer = newState.characters.find((c) => c.id === newState.currentPlayerId);
  if (newState.currentPlayerId && currentPlayer && !currentPlayer.isAlive) {
    const livingOffspring = newState.characters.filter(
      (c) => c.isAlive && (c.motherId === newState.currentPlayerId || c.fatherId === newState.currentPlayerId),
    );

    if (livingOffspring.length > 0) {
      livingOffspring.sort((a, b) => b.age - a.age);
      const heir = livingOffspring[0];
      newState.currentPlayerId = heir.id;
      const heirCharacter = newState.characters.find((c) => c.id === heir.id)!;
      heirCharacter.type = 'player';
      heirCharacter.velocity = { x: 0, y: 0 };
      newState.generationCount++;
    } else {
      newState.gameOver = true;
      newState.causeOfGameOver = `Lineage Extinct: Player died of ${currentPlayer.causeOfDeath || 'unknown reasons'}.`;
      newState.currentPlayerId = null;
    }
  }

  return newState;
}

export function feedChild(gameState: GameWorldState, playerId: string, childId: string): GameWorldState {
  const player = gameState.characters.find((c) => c.id === playerId);
  const child = gameState.characters.find((c) => c.id === childId);

  if (player && child && player.inventory > 0 && child.type === 'child' && child.isAlive) {
    const dist = distance(player.position, child.position);
    if (dist < INTERACTION_RANGE) {
      // Player feeds child
      player.inventory--;
      child.hunger = Math.max(0, child.hunger - BERRY_NUTRITION);
      console.log(`${player.id} fed ${child.id}. Child hunger: ${child.hunger}`);
      // Child might stop seeking parent if hunger is low enough
      if (child.hunger < CHILD_HUNGER_THRESHOLD_FOR_SEEKING_PARENT) {
        child.currentAction = 'childWandering'; // Or 'idle' if preferred after being fed
        child.targetPosition = undefined; // Clear target if was seeking parent
        child.velocity = { x: 0, y: 0 };
      }
    }
  }
  return gameState; // Return modified state
}

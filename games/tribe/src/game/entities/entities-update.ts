import { Entities, Entity, EntityId, EntityType } from './entities-types';
import { UpdateContext } from '../world-types';
import { entityUpdate } from './entity-update';
import { Vector2D } from '../utils/math-types';
import { vectorAdd } from '../utils/math-utils';
import { BerryBushEntity } from './plants/berry-bush/berry-bush-types';
import { BUSH_GROWING } from './plants/berry-bush/states/bush-state-types';
import {
  BERRY_BUSH_INITIAL_FOOD,
  BERRY_BUSH_MAX_FOOD,
  BERRY_BUSH_LIFESPAN_GAME_HOURS,
  BERRY_BUSH_SPREAD_CHANCE,
  BERRY_BUSH_SPREAD_RADIUS,
  HUMAN_INITIAL_AGE,
  HUMAN_INITIAL_HUNGER,
  HUMAN_MAX_AGE_YEARS,
  CHILD_TO_ADULT_AGE,
  CHARACTER_RADIUS,
  CHARACTER_CHILD_RADIUS,
  HUMAN_MAX_FOOD,
  HUMAN_CORPSE_INITIAL_FOOD,
  HUMAN_HUNGER_THRESHOLD_CRITICAL,
  HUMAN_MAX_HITPOINTS,
  MAX_ANCESTORS_TO_TRACK,
  PREY_MAX_AGE_YEARS,
  PREY_INITIAL_HUNGER,
  PREY_INITIAL_AGE,
  PREY_MAX_HITPOINTS,
  PREY_MIN_PROCREATION_AGE,
  PREDATOR_MAX_AGE_YEARS,
  PREDATOR_INITIAL_HUNGER,
  PREDATOR_INITIAL_AGE,
  PREDATOR_MAX_HITPOINTS,
  PREDATOR_MIN_PROCREATION_AGE,
} from '../world-consts';
import { CorpseEntity } from './characters/corpse-types';
import { HumanEntity } from './characters/human/human-types';
import { PreyEntity } from './characters/prey/prey-types';
import { PredatorEntity } from './characters/predator/predator-types';
import { HUMAN_IDLE } from './characters/human/states/human-state-types';
import { PREY_IDLE } from './characters/prey/states/prey-state-types';
import { PREDATOR_IDLE } from './characters/predator/states/predator-state-types';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { FoodItem, FoodType } from '../food/food-types';
import { AIType } from '../ai/ai-types';
import { buildHumanBehaviorTree } from '../ai/behavior-tree/human-behavior-tree';
import { buildPreyBehaviorTree } from '../ai/behavior-tree/prey-behavior-tree';
import { buildPredatorBehaviorTree } from '../ai/behavior-tree/predator-behavior-tree';
import { Blackboard } from '../ai/behavior-tree/behavior-tree-blackboard';

export function entitiesUpdate(updateContext: UpdateContext): void {
  const state = updateContext.gameState.entities;
  // First handle prey-to-carrion conversion
  state.entities.forEach((entity) => {
    entityUpdate(entity, updateContext);
  });
}

export function createEntities(): Entities {
  const state = {
    entities: new Map<EntityId, Entity>(),
    nextEntityId: 1,
  };
  return state;
}

function createEntity<T extends Entity>(
  state: Entities,
  type: EntityType,
  initialState: Partial<Entity> &
    Omit<T, 'id' | 'type' | 'velocity' | 'forces' | 'direction' | 'targetDirection' | 'acceleration' | 'debuffs'>,
): T {
  const entity: Entity = {
    id: state.nextEntityId++,
    type,
    velocity: { x: 0, y: 0 },
    direction: { x: 0, y: 0 },
    acceleration: 0,
    forces: [],
    debuffs: [],
    ...initialState,
  };
  state.entities.set(entity.id, entity);
  return entity as T;
}

export function createBerryBush(state: Entities, initialPosition: Vector2D, currentTime: number): BerryBushEntity {
  const bush = createEntity<BerryBushEntity>(state, 'berryBush', {
    position: initialPosition,
    radius: BERRY_BUSH_SPREAD_RADIUS,
    food: Array.from({ length: BERRY_BUSH_INITIAL_FOOD }, () => ({ type: FoodType.Berry })).map((f) => ({
      ...f,
      id: state.nextEntityId++,
    })),
    maxFood: BERRY_BUSH_MAX_FOOD,
    lifespan: BERRY_BUSH_LIFESPAN_GAME_HOURS,
    age: 0,
    spreadChance: BERRY_BUSH_SPREAD_CHANCE,
    spreadRadius: BERRY_BUSH_SPREAD_RADIUS,
    timeSinceLastBerryRegen: 0,
    timeSinceLastSpreadAttempt: 0,
    timeSinceLastHarvest: 0,
    stateMachine: [BUSH_GROWING, { enteredAt: currentTime, previousState: undefined }],
  });
  return bush;
}

export function createHuman(
  state: Entities,
  initialPosition: Vector2D,
  currentTime: number,
  gender: 'male' | 'female',
  isPlayer: boolean = false,
  initialAge: number = HUMAN_INITIAL_AGE,
  initialHunger: number = HUMAN_INITIAL_HUNGER,
  motherId?: EntityId,
  fatherId?: EntityId,
  ancestorIds: EntityId[] = [],
  leaderId?: EntityId,
  tribeBadge?: string,
): HumanEntity {
  const isAdult = initialAge >= CHILD_TO_ADULT_AGE;

  const human = createEntity<HumanEntity>(state, 'human', {
    position: initialPosition,
    radius: isAdult ? CHARACTER_RADIUS : CHARACTER_CHILD_RADIUS,
    hunger: initialHunger,
    hitpoints: HUMAN_MAX_HITPOINTS,
    maxHitpoints: HUMAN_MAX_HITPOINTS,
    age: initialAge,
    gender,
    isPlayer,
    food: [],
    maxFood: HUMAN_MAX_FOOD,
    maxAge: HUMAN_MAX_AGE_YEARS,
    isAdult,
    isPregnant: false,
    gestationTime: 0,
    procreationCooldown: 0,
    attackCooldown: 0,
    motherId,
    fatherId,
    ancestorIds,
    stateMachine: [HUMAN_IDLE, { enteredAt: currentTime, previousState: undefined }],
    leaderId,
    tribeBadge,
    aiType: AIType.BehaviorTreeBased,
    aiBehaviorTree: buildHumanBehaviorTree(),
    aiBlackboard: new Blackboard(),
  });

  return human;
}

export function createCorpse(
  state: Entities,
  position: Vector2D,
  gender: 'male' | 'female',
  age: number,
  radius: number,
  originalEntityId: EntityId,
  originalEntityType: 'human' | 'prey' | 'predator',
  currentTime: number,
  carriedFood: FoodItem[],
  hunger: number,
  geneCode?: number,
): CorpseEntity {
  // Calculate meat amount based on original entity type and hunger level
  let initialFood: number;
  let hungerThreshold: number;
  
  switch (originalEntityType) {
    case 'human':
      initialFood = HUMAN_CORPSE_INITIAL_FOOD;
      hungerThreshold = HUMAN_HUNGER_THRESHOLD_CRITICAL;
      break;
    case 'prey':
      initialFood = 2; // Prey provides less meat than humans
      hungerThreshold = 120; // Prey hunger death threshold
      break;
    case 'predator':
      initialFood = 4; // Predators provide more meat than prey
      hungerThreshold = 140; // Predator hunger death threshold
      break;
  }

  const corpse = createEntity<CorpseEntity>(state, 'corpse', {
    position,
    radius: radius,
    gender,
    age,
    originalEntityId,
    originalEntityType,
    timeOfDeath: currentTime,
    decayProgress: 0,
    geneCode,
    food: [
      ...Array.from(
        {
          length: Math.max(
            (initialFood * Math.max(hungerThreshold - hunger, 0)) / hungerThreshold,
            1,
          ),
        },
        () => ({ type: FoodType.Meat }),
      ),
      ...carriedFood,
    ].map((f) => ({ ...f, id: state.nextEntityId++ })),
    // Corpses don't have these properties, so set to default/null values
    stateMachine: undefined,
  });
  return corpse;
}

export function createHumanCorpse(
  state: Entities,
  position: Vector2D,
  gender: 'male' | 'female',
  age: number,
  radius: number,
  originalHumanId: EntityId,
  currentTime: number,
  carriedFood: FoodItem[],
  hunger: number,
): CorpseEntity {
  return createCorpse(
    state,
    position,
    gender,
    age,
    radius,
    originalHumanId,
    'human',
    currentTime,
    carriedFood,
    hunger,
  );
}

export function createPreyCorpse(
  state: Entities,
  position: Vector2D,
  gender: 'male' | 'female',
  age: number,
  radius: number,
  originalPreyId: EntityId,
  currentTime: number,
  geneCode: number,
): CorpseEntity {
  return createCorpse(
    state,
    position,
    gender,
    age,
    radius,
    originalPreyId,
    'prey',
    currentTime,
    [], // Prey don't carry food
    0, // Default hunger for meat calculation
    geneCode,
  );
}

export function createPredatorCorpse(
  state: Entities,
  position: Vector2D,
  gender: 'male' | 'female',
  age: number,
  radius: number,
  originalPredatorId: EntityId,
  currentTime: number,
  geneCode: number,
): CorpseEntity {
  return createCorpse(
    state,
    position,
    gender,
    age,
    radius,
    originalPredatorId,
    'predator',
    currentTime,
    [], // Predators don't carry food
    0, // Default hunger for meat calculation
    geneCode,
  );
}

export function giveBirth(
  mother: HumanEntity,
  fatherId: EntityId | undefined,
  updateContext: UpdateContext,
): HumanEntity | undefined {
  const father = fatherId ? (updateContext.gameState.entities.entities.get(fatherId) as HumanEntity) : undefined;

  // Combine ancestor lists from both parents
  const motherAncestors = [...(mother.ancestorIds || []), mother.id];
  const fatherAncestors = father ? [...(father.ancestorIds || []), father.id] : [];
  const combinedAncestors = [...motherAncestors, ...fatherAncestors];

  // Remove duplicates and limit the list to the most recent ancestors
  const uniqueAncestors = [...new Set(combinedAncestors)];
  const childAncestors = uniqueAncestors.slice(Math.max(uniqueAncestors.length - MAX_ANCESTORS_TO_TRACK, 0));

  // Generate random gender
  const childGender: 'male' | 'female' = Math.random() < 0.5 ? 'male' : 'female';

  // Create a slightly offset position to avoid exact overlap
  const childPosition = vectorAdd(mother.position, { x: 5, y: 5 });

  // Create the child entity
  const child = createHuman(
    updateContext.gameState.entities,
    childPosition,
    updateContext.gameState.time,
    childGender,
    false, // Not player-controlled
    0, // Age 0
    HUMAN_INITIAL_HUNGER / 2, // Start with half hunger
    mother.id, // Mother ID
    fatherId, // Father ID
    childAncestors,
    father?.leaderId ?? mother.leaderId, // Inherit leader ID from mother or father
    father?.tribeBadge ?? mother.tribeBadge, // Inherit tribe badge from mother or father
  );

  // Play birth sound
  playSoundAt(updateContext, SoundType.Birth, mother.position);

  return child;
}

export function removeEntity(state: Entities, entityId: EntityId): boolean {
  if (!state.entities.get(entityId)) return false;
  state.entities.delete(entityId);
  return true;
}

export function createPrey(
  state: Entities,
  initialPosition: Vector2D,
  gender: 'male' | 'female',
  initialAge: number = PREY_INITIAL_AGE,
  initialHunger: number = PREY_INITIAL_HUNGER,
  geneCode: number,
  motherId?: EntityId,
  fatherId?: EntityId,
): PreyEntity {
  const isAdult = initialAge >= PREY_MIN_PROCREATION_AGE;
  const currentTime = Date.now(); // Use current timestamp for state machine

  const prey = createEntity<PreyEntity>(state, 'prey', {
    position: initialPosition,
    radius: isAdult ? CHARACTER_RADIUS * 0.7 : CHARACTER_CHILD_RADIUS * 0.7, // Smaller than humans
    hunger: initialHunger,
    hitpoints: PREY_MAX_HITPOINTS,
    maxHitpoints: PREY_MAX_HITPOINTS,
    age: initialAge,
    maxAge: PREY_MAX_AGE_YEARS,
    gender,
    isAdult,
    isPregnant: false,
    gestationTime: 0,
    procreationCooldown: 0,
    geneCode,
    motherId,
    fatherId,
    stateMachine: [PREY_IDLE, { enteredAt: currentTime, previousState: undefined }],
    aiType: AIType.BehaviorTreeBased,
    aiBehaviorTree: buildPreyBehaviorTree(),
    aiBlackboard: new Blackboard(),
  });

  return prey;
}

export function createPredator(
  state: Entities,
  initialPosition: Vector2D,
  gender: 'male' | 'female',
  initialAge: number = PREDATOR_INITIAL_AGE,
  initialHunger: number = PREDATOR_INITIAL_HUNGER,
  geneCode: number,
  motherId?: EntityId,
  fatherId?: EntityId,
): PredatorEntity {
  const isAdult = initialAge >= PREDATOR_MIN_PROCREATION_AGE;
  const currentTime = Date.now(); // Use current timestamp for state machine

  const predator = createEntity<PredatorEntity>(state, 'predator', {
    position: initialPosition,
    radius: isAdult ? CHARACTER_RADIUS * 0.9 : CHARACTER_CHILD_RADIUS * 0.9, // Slightly smaller than humans
    hunger: initialHunger,
    hitpoints: PREDATOR_MAX_HITPOINTS,
    maxHitpoints: PREDATOR_MAX_HITPOINTS,
    age: initialAge,
    maxAge: PREDATOR_MAX_AGE_YEARS,
    gender,
    isAdult,
    isPregnant: false,
    gestationTime: 0,
    procreationCooldown: 0,
    geneCode,
    motherId,
    fatherId,
    stateMachine: [PREDATOR_IDLE, { enteredAt: currentTime, previousState: undefined }],
    aiType: AIType.BehaviorTreeBased,
    aiBehaviorTree: buildPredatorBehaviorTree(),
    aiBlackboard: new Blackboard(),
  });

  return predator;
}

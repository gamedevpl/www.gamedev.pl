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
} from '../world-consts';
import { HumanCorpseEntity } from './characters/human/human-corpse-types';
import { HumanEntity } from './characters/human/human-types';
import { HUMAN_IDLE } from './characters/human/states/human-state-types';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { FoodItem, FoodType } from '../food/food-types';
import { inheritKarma } from '../karma/karma-utils';
import { AIType } from '../ai/ai-types';
import { buildHumanBehaviorTree } from '../ai/behavior-tree/human-behavior-tree';
import { Blackboard } from '../ai/behavior-tree/behavior-tree-blackboard';

export function entitiesUpdate(updateContext: UpdateContext): void {
  const state = updateContext.gameState.entities;
  // First handle prey-to-carrion conversion
  state.entities.forEach((entity) => {
    // generic entity update
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
    karma: {},
    stateMachine: [HUMAN_IDLE, { enteredAt: currentTime, previousState: undefined }],
    leaderId,
    tribeBadge,
    aiType: AIType.BehaviorTreeBased,
    aiBehaviorTree: buildHumanBehaviorTree(),
    aiBlackboard: new Blackboard(),
  });

  return human;
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
): HumanCorpseEntity {
  const corpse = createEntity<HumanCorpseEntity>(state, 'humanCorpse', {
    position,
    radius: radius,
    gender,
    age,
    originalHumanId,
    timeOfDeath: currentTime,
    decayProgress: 0,
    food: [
      ...Array.from(
        {
          length: Math.max(
            (HUMAN_CORPSE_INITIAL_FOOD * Math.max(HUMAN_HUNGER_THRESHOLD_CRITICAL - hunger, 0)) /
              HUMAN_HUNGER_THRESHOLD_CRITICAL,
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
    father?.leaderId,
    father?.tribeBadge,
  );

  inheritKarma(child, mother, father);

  // Play birth sound
  playSoundAt(updateContext, SoundType.Birth, mother.position);

  return child;
}

export function removeEntity(state: Entities, entityId: EntityId): boolean {
  if (!state.entities.get(entityId)) return false;
  state.entities.delete(entityId);
  return true;
}

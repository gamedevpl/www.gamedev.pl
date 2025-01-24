import { StateData, StateType } from '../state-machine/state-machine-types';
import { Vector2D } from '../utils/math-types';

export type EntityId = number;

export type EntityType = 'lion' | 'prey' | 'carrion';

export interface Entity {
  id: EntityId;
  isPlayer?: boolean;
  type: EntityType;
  position: Vector2D;
  direction: number;
  targetDirection: number;
  acceleration: number;
  forces: Vector2D[];
  velocity: Vector2D;
  stateMachine?: [StateType, StateData];
  debuffs: ActiveDebuff[];
}

/**
 * Represents an active debuff effect on an entity
 */
export interface ActiveDebuff {
  /** Debuff type */
  type: 'slow';
  /** Time when the debuff was applied */
  startTime: number;
  /** Duration of the debuff in milliseconds */
  duration: number;
}

export interface LionEntity extends Entity {
  type: 'lion';
  target: {
    entityId?: EntityId;
    position?: Vector2D;
  };
  actions: {
    walk: { enabled: boolean };
    attack: { enabled: boolean };
    ambush: { enabled: boolean };
  };
  stateMachine: [StateType, StateData];
  /** Hunger level (0-100). At 0, lion starts starving */
  hungerLevel: number;
}

export interface PreyEntity extends Entity {
  type: 'prey';
  /** Health level (0-100). At 0, prey becomes carrion */
  health: number;
  /** Hunger level (0-100). At 0, health starts decreasing */
  hungerLevel: number;
  /** Thirst level (0-100). At 0, health starts decreasing */
  thirstLevel: number;
  /** Stamina level (0-100). At 0, prey can't move */
  staminaLevel: number;
  stateMachine: [StateType, StateData];
}

export interface CarrionEntity extends Entity {
  type: 'carrion';
  food: number;
  decay: number;
}

export type Entities = {
  entities: Map<EntityId, Entity>;
  nextEntityId: EntityId;
};

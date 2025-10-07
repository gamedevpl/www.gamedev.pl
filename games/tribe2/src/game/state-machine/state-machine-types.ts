import { Entity } from '../types/game-types';

/**
 * Represents a single state in a state machine.
 * @template T The type of the entity this state belongs to.
 */
export interface State<T extends Entity> {
  /**
   * A unique identifier for the state.
   */
  name: string;

  /**
   * Called when the state is entered.
   * @param entity The entity entering the state.
   */
  onEnter?: (entity: T) => void;

  /**
   * Called on every game update while the entity is in this state.
   * @param entity The entity in this state.
   * @param deltaTime The time elapsed since the last update in seconds.
   */
  onUpdate: (entity: T, deltaTime: number) => void;

  /**
   * Called when the state is exited.
   * @param entity The entity exiting the state.
   */
  onExit?: (entity: T) => void;
}

/**
 * The component that manages the state of an entity.
 */
export interface StateMachineComponent {
  /**
   * The current state of the entity.
   */
  currentState: string;
  /**
   * The previous state of the entity, if any.
   */
  previousState?: string;
  /**
   * A map of state names to their corresponding state objects.
   */
  states: { [key: string]: State<Entity> };
  /**
   * A timer to track how long the entity has been in the current state.
   */
  timeInState: number;
}

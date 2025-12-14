/**
 * Defines the types used for saving and loading the game state.
 */

import { GameWorldState } from '../world-types';

/**
 * Represents the structure of the data that is saved to persistent storage.
 */
export interface SavedGameState {
  /**
   * The version of the save format. This is useful for handling migrations
   * if the structure of the saved data changes in future updates.
   */
  version: number;

  /**
   * The timestamp when the game was saved.
   */
  savedAt: number;

  /**
   * The main game state that is being saved.
   */
  gameState: SerializedWorldState;
}

/**
 * A helper that returns T if it is a valid JSON primitive,
 * otherwise returns 'never' or a custom error message.
 */
export type StrictJson<T> =
  // 1. Check for toJSON() method first (Escape hatch for Classes)
  T extends { toJSON(): infer R }
    ? StrictJson<R>
    : // 2. Primitives are allowed
    T extends string | number | boolean | null
    ? T
    : // 3. Tuples: Check for fixed-length arrays BEFORE generic arrays
    // (Add more lines here if you have longer tuples)
    T extends [infer A, infer B]
    ? [StrictJson<A>, StrictJson<B>]
    : T extends [infer A, infer B, infer C]
    ? [StrictJson<A>, StrictJson<B>, StrictJson<C>]
    : T extends [infer A, infer B, infer C, infer D]
    ? [StrictJson<A>, StrictJson<B>, StrictJson<C>, StrictJson<D>]
    : // 4. Arrays & Readonly Arrays
    T extends Array<infer U>
    ? Array<StrictJson<U>>
    : T extends readonly (infer U)[]
    ? readonly StrictJson<U>[]
    : // 5. Objects: Recurse over keys
    T extends object
    ? // 5a. Reject known bad types immediately
      T extends Map<any, any>
      ? NotJsonable<'Map is not JSON compatible'>
      : T extends Set<any>
      ? NotJsonable<'Set is not JSON compatible'>
      : T extends (...args: any[]) => any
      ? NotJsonable<'Functions are not JSON compatible'>
      : T extends Date
      ? NotJsonable<'Date is not compatible (converts to string)'>
      : // 5b. Class Instance Check (Optional strictness)
      // If it has a constructor that isn't Object, and NO toJSON method (checked in step 1), block it.
      IsClassInstance<T> extends true
      ? NotJsonable<'Class instances without toJSON() are not compatible'>
      : // 5c. Valid Object: Recurse keys
        { [K in keyof T]: StrictJson<T[K]> }
    : // 6. Fail on anything else (undefined, symbol, etc)
      NotJsonable<'Type is not JSON compatible'>;

/**
 * A descriptive error type that prevents assignment.
 * It creates an impossible type that gives you a readable error in the IDE tooltip.
 */
type NotJsonable<Msg extends string> = never & { __error_msg__: Msg };

/**
 * 2. Helper type to check if T is a class instance
 */
type IsClassInstance<T> = T extends { new (...args: any[]): any } ? true : false;

/**
 * 3. Define SerializedWorldState
 * Instead of explicitly rewriting the type, use the helper.
 */
export type SerializedWorldState = StrictJson<GameWorldState>;

/**
 * Message types for communication between the main thread and the persistence worker.
 */
export enum WorkerMessageType {
  SAVE_REQUEST = 'SAVE_REQUEST',
  SAVE_RESPONSE = 'SAVE_RESPONSE',
  LOAD_REQUEST = 'LOAD_REQUEST',
  LOAD_RESPONSE = 'LOAD_RESPONSE',
  CLEAR_REQUEST = 'CLEAR_REQUEST',
  CLEAR_RESPONSE = 'CLEAR_RESPONSE',
}

/**
 * Request to save game state to persistent storage (sent from main thread to worker).
 */
export interface SaveRequest {
  type: WorkerMessageType.SAVE_REQUEST;
  id: string;
  gameState: SerializedWorldState;
}

/**
 * Request to load game state from persistent storage (sent from main thread to worker).
 */
export interface LoadRequest {
  type: WorkerMessageType.LOAD_REQUEST;
  id: string;
}

/**
 * Request to clear saved game state (sent from main thread to worker).
 */
export interface ClearRequest {
  type: WorkerMessageType.CLEAR_REQUEST;
  id: string;
}

/**
 * Response to a save request (sent from worker to main thread).
 */
export interface SaveResponse {
  type: WorkerMessageType.SAVE_RESPONSE;
  id: string;
  success: boolean;
  error?: string;
  size?: number;
}

/**
 * Response to a load request (sent from worker to main thread).
 */
export interface LoadResponse {
  type: WorkerMessageType.LOAD_RESPONSE;
  id: string;
  success: boolean;
  gameState?: SerializedWorldState;
  error?: string;
}

/**
 * Response to a clear request (sent from worker to main thread).
 */
export interface ClearResponse {
  type: WorkerMessageType.CLEAR_RESPONSE;
  id: string;
  success: boolean;
  error?: string;
}

/**
 * Union type of all worker messages for type-safe communication.
 */
export type WorkerMessage = SaveRequest | SaveResponse | LoadRequest | LoadResponse | ClearRequest | ClearResponse;

import * as RAPIER from '@dimforge/rapier2d';
import { GameState } from '../game-state/game-state-types';

export type PhysicsState = {
  world: RAPIER.World;
  sourceGameState: GameState;
};

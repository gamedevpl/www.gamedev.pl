import { Entity, EntityType } from './entities-types';
import { GameState, UpdateContext } from './game-world-types';

export type AgenticBehavior = {
  entityType?: EntityType;

  perform: (gameState: GameState, entity: Entity, updateContext: UpdateContext) => void;
};

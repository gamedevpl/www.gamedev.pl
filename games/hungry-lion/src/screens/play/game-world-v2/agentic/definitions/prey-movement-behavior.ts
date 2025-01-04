import { AgenticBehavior } from '../agentic-types';
import { vectorRotate, vectorScale } from '../../math-utils';
import { PreyEntity } from '../../entities-types';

const PREY_SPEED = 0.001; // units per second

// Basic prey movement with random direction changes
export const PREY_MOVEMENT: AgenticBehavior<PreyEntity> = {
  entityType: 'prey',
  perform: (_gameState, entity) => {
    // Random angle change between -45 and 45 degrees
    const angleChange = ((Math.random() - 0.5) * Math.PI) / 2;
    entity.forces.push(
      vectorScale(
        vectorRotate({ x: Math.cos(entity.direction), y: Math.sin(entity.direction) }, angleChange),
        PREY_SPEED,
      ),
    );
    entity.state = 'moving';
  },
};

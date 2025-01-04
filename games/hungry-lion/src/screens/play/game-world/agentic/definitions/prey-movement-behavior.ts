import { AgenticBehavior } from '../agentic-types';
import { PreyEntity } from '../../entities-types';

// Basic prey movement with random direction changes
export const PREY_MOVEMENT: AgenticBehavior<PreyEntity> = {
  entityType: 'prey',
  perform: (_gameState, entity) => {
    // Only apply random movement if not fleeing
    if (entity.state !== 'fleeing') {
      // Random angle change between -45 and 45 degrees
      const angleChange = ((Math.random() - 0.5) * Math.PI) / 2;
      entity.targetDirection += angleChange / 10;
      entity.acceleration = 0.01;
      entity.state = 'moving';
    }
  },
};

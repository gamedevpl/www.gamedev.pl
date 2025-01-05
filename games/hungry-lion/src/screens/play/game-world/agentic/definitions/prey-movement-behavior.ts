import { AgenticBehavior } from '../agentic-types';
import { PreyEntity } from '../../entities-types';

// Constants for behavior parameters
const IDLE_CHANCE = 0.1; // 10% chance to be idle
const MAX_SPEED_VARIATION = 0.005; // Maximum speed variation from base speed

// Basic prey movement with natural behaviors
export const PREY_MOVEMENT: AgenticBehavior<PreyEntity> = {
  entityType: 'prey',
  perform: (entity) => {
    if (
      entity.state === 'fleeing' ||
      entity.state === 'eating' ||
      entity.state === 'drinking' ||
      entity.thirstLevel < 30 ||
      entity.hungerLevel > 30
    ) {
      return;
    }

    entity.state = Math.random() < IDLE_CHANCE ? 'idle' : 'moving';

    if (entity.state === 'idle') {
      // Idle state - no movement
      entity.acceleration = 0;
    } else {
      // Moving state
      entity.state = 'moving';
      // Random movement
      const angleChange = ((Math.random() - 0.5) * Math.PI) / 2;
      entity.targetDirection += angleChange / 10;

      // Apply speed variation
      entity.acceleration = 0.005 * (1 + (Math.random() - 0.5) * MAX_SPEED_VARIATION);
    }
  },
};

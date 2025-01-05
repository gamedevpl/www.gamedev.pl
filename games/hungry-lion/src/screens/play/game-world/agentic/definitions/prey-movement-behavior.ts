import { AgenticBehavior } from '../agentic-types';
import { PreyEntity } from '../../entities-types';

// Constants for behavior parameters
const IDLE_CHANCE = 0.4; // 40% chance to be idle
const MIN_MOVE_DURATION = 1000; // Minimum move duration in ms
const MAX_MOVE_DURATION = 5000; // Maximum move duration in ms
const MAX_SPEED_VARIATION = 0.005; // Maximum speed variation from base speed

// Basic prey movement with natural behaviors
export const PREY_MOVEMENT: AgenticBehavior<PreyEntity> = {
  entityType: 'prey',
  perform: (gameState, entity) => {
    if (entity.state === 'fleeing') {
      return;
    }
    // Only apply movement if not fleeing
    // Handle idle state
    if (!entity.lastBehaviorUpdate) {
      entity.lastBehaviorUpdate = gameState.time;
    }

    // Check if it's time to change behavior
    const now = gameState.time;
    if (now - entity.lastBehaviorUpdate > (entity.currentBehavior === 'idle' ? MIN_MOVE_DURATION : MAX_MOVE_DURATION)) {
      entity.lastBehaviorUpdate = now;
      entity.currentBehavior = Math.random() < IDLE_CHANCE ? 'idle' : 'moving';
    }

    if (entity.currentBehavior === 'idle') {
      // Idle state - no movement
      entity.acceleration = 0;
      entity.state = 'idle';
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

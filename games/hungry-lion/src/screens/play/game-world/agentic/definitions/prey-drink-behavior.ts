import { PreyEntity } from '../../entities/entities-types';
import { AgenticBehavior } from '../agentic-types';
import { findClosestSector, getSectorAtEntity } from '../../environment/environment-query';

const MAX_SPEED_VARIATION = 0.005; // Maximum speed variation from base speed

export const PREY_DRINKING: AgenticBehavior<PreyEntity> = {
  entityType: 'prey',
  perform: (entity, { gameState }) => {
    if (entity.state === 'drinking') {
      if (entity.thirstLevel >= 90) {
        entity.state = 'idle';
        return;
      }
      const sector = getSectorAtEntity(gameState.environment, entity, 'water');
      if (!sector) {
        entity.state = 'idle';
        return;
      }
    } else {
      if (entity.thirstLevel > 30 || entity.state === 'fleeing' || entity.state === 'eating') {
        return;
      }

      const sector = getSectorAtEntity(gameState.environment, entity, 'water');
      if (sector) {
        entity.state = 'drinking';
        entity.acceleration = 0;
        return;
      }

      const [closestSector] = findClosestSector(gameState.environment, entity, 'water');
      if (!closestSector) {
        return;
      }

      const targetX = closestSector.rect.x + closestSector.rect.width / 2;
      const targetY = closestSector.rect.y + closestSector.rect.height / 2;
      entity.targetDirection = Math.atan2(targetY - entity.position.y, targetX - entity.position.x);

      entity.acceleration = 0.005 * (1 + (Math.random() - 0.5) * MAX_SPEED_VARIATION);
    }
  },
};

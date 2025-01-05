import { AgenticBehavior } from '../agentic-types';
import { isLion } from '../../game-world-query';
import { LionEntity } from '../../entities/entities-types';

export const LION_MOVE_TO_TARGET: AgenticBehavior<LionEntity> = {
  entityType: 'lion',
  perform: (entity, { gameState }) => {
    if (!isLion(entity) || (!entity.target.position && !entity.target.entityId)) return;

    entity.acceleration = 0;

    let targetPosition = entity.target.position;

    if (entity.target.entityId) {
      const target = gameState.entities.entities.get(entity.target.entityId);
      if (!target) return;

      targetPosition = target.position;
    }

    if (!targetPosition) return;

    const dx = targetPosition.x - entity.position.x;
    const dy = targetPosition.y - entity.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < 10) {
      return;
    }

    entity.targetDirection = Math.atan2(dy, dx);
    entity.acceleration = 0.01;
  },
};

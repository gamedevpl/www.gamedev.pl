import { LionEntity } from '../../../entities/entities-types';

// Helper function to update movement towards target
export function moveTowardsTarget(entity: LionEntity, targetX: number, targetY: number, acceleration: number): void {
  const dx = targetX - entity.position.x;
  const dy = targetY - entity.position.y;

  entity.targetDirection = Math.atan2(dy, dx);
  entity.acceleration = acceleration;
}

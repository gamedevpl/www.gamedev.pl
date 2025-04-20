import { LionEntity } from '../../../entities/entities-types';
import { calculateWrappedVectorDifference } from '../../../utils/math-utils'; // Import

// Helper function to update movement towards target
export function moveTowardsTarget(entity: LionEntity, targetX: number, targetY: number, acceleration: number): void {
  // Use calculateWrappedVectorDifference to get the wrapped direction
  const directionVector = calculateWrappedVectorDifference({ x: targetX, y: targetY }, entity.position);

  entity.targetDirection = Math.atan2(directionVector.y, directionVector.x);
  entity.acceleration = acceleration;
}

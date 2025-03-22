import { LionEntity } from '../../game-world/entities/entities-types';
import { LION_WIDTH } from '../../game-world/game-world-consts';
import { vectorLength } from '../../game-world/utils/math-utils';

import { Lion2d } from '../../../../../../../tools/asset-generator/generator-assets/src/lion-2d/lion-2d';

function getLionStance(stateType: string, isMoving: boolean, isEating: boolean): string {
  if (isEating) {
    return 'eating';
  }

  switch (stateType) {
    case 'LION_IDLE':
      return isMoving ? 'walking' : 'standing';
    case 'LION_MOVING_TO_TARGET':
      return 'walking';
    case 'LION_CHASING':
      return 'running';
    case 'LION_AMBUSH':
      return 'ambushing';
    default:
      return 'standing';
  }
}

function getLionFacingDirection(lion: LionEntity): 'left' | 'right' {
  return lion.targetDirection > -Math.PI / 2 && lion.targetDirection < Math.PI / 2 ? 'right' : 'left';
}

export function drawLion(ctx: CanvasRenderingContext2D, lion: LionEntity) {
  const width = LION_WIDTH;
  const height = LION_WIDTH;

  const position = lion.position;
  const isMoving = vectorLength(lion.velocity) > 0.1;

  // Get the current state type from the lion's state machine
  const currentStateType = lion.stateMachine?.[0] || 'LION_IDLE';

  // Check if the lion is eating (when hunger level is changing)
  const isEating = lion.hungerLevel < 100 && lion.target.entityId !== undefined && !isMoving;

  // Determine the appropriate stance based on state and movement
  const stance = getLionStance(currentStateType, isMoving, isEating);

  // Determine the facing direction using the state-based approach
  const facingDirection = getLionFacingDirection(lion);

  // Determine animation frame based on time
  const animationTime = (Date.now() % 1000) / 1000;

  // Render the lion with the appropriate stance and direction
  Lion2d.render(ctx, position.x, position.y, width, height, animationTime, stance, facingDirection);
}

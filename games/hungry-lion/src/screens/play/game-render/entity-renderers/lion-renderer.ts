import { LionEntity } from '../../game-world/entities/entities-types';
import { LION_WIDTH } from '../../game-world/game-world-consts';
import { vectorLength } from '../../game-world/utils/math-utils';

import { Lion2d } from '../../../../../../../tools/asset-generator/generator-assets/src/lion-2d/lion-2d';
import { drawHungerWarningBubble } from '../notifications/hunger-warning';
import { drawTargetIcon } from '../notifications/target-notification';
import { GameWorldState } from '../../game-world/game-world-types';

// Hunger threshold constants
const HUNGER_WARNING_THRESHOLD = 50; // When to start showing warnings
export const HUNGER_CRITICAL_THRESHOLD = 25; // When to make warnings more urgent

function getLionStance(stateType: string, isMoving: boolean): string {
  switch (stateType) {
    case 'LION_IDLE':
      return isMoving ? 'walking' : 'standing';
    case 'LION_MOVING_TO_TARGET':
      return 'walking';
    case 'LION_CHASING':
      return 'running';
    case 'LION_AMBUSH':
      return 'ambushing';
    case 'LION_EATING':
      return 'eating';
    default:
      return 'standing';
  }
}

function getLionFacingDirection(lion: LionEntity): 'left' | 'right' {
  return lion.targetDirection > -Math.PI / 2 && lion.targetDirection < Math.PI / 2 ? 'right' : 'left';
}

export function drawLion(ctx: CanvasRenderingContext2D, gameState: GameWorldState, lion: LionEntity) {
  const width = LION_WIDTH;
  const height = LION_WIDTH;

  const position = lion.position;
  const isMoving = vectorLength(lion.velocity) > 0.1;

  // Get the current state type from the lion's state machine
  const currentStateType = lion.stateMachine?.[0] || 'LION_IDLE';

  // Determine the appropriate stance based on state and movement
  const stance = getLionStance(currentStateType, isMoving);

  // Determine the facing direction using the state-based approach
  const facingDirection = getLionFacingDirection(lion);

  // Determine animation frame based on time
  const animationTime = (Date.now() % 1000) / 1000;

  // Render the lion with the appropriate stance and direction
  Lion2d.render(
    ctx,
    position.x - width / 2,
    position.y - height / 2,
    width,
    height,
    animationTime,
    stance,
    facingDirection,
  );

  // Draw hunger warning bubble if hunger is below warning threshold
  if (lion.hungerLevel < HUNGER_WARNING_THRESHOLD) {
    drawHungerWarningBubble(ctx, position.x, position.y, lion.hungerLevel);
  }

  // Draw target notification if lion has a target
  drawTargetIcon(ctx, gameState, lion);
}

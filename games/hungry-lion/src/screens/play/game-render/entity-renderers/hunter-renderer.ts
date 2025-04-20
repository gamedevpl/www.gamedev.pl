import { HunterEntity } from '../../game-world/entities/entities-types';
import { vectorLength } from '../../game-world/utils/math-utils';
import { Hunter2d } from '../../../../../../../tools/asset-generator/generator-assets/src/hunter-2d/hunter-2d';
import { HunterStateType } from '../../game-world/state-machine/states/hunter';
import { GameWorldState } from '../../game-world/game-world-types';

// Constants for hunter rendering
const HUNTER_WIDTH = 40;
const HUNTER_HEIGHT = 40;

/**
 * Get the hunter's stance based on state and movement
 */
function getHunterStance(stateType: HunterStateType, isMoving: boolean): string {
  switch (stateType) {
    case 'HUNTER_PATROLLING':
      return isMoving ? 'walking' : 'standing';
    case 'HUNTER_WAITING':
      return 'standing';
    case 'HUNTER_CHASING':
      return 'running';
    case 'HUNTER_SHOOTING':
      return 'attacking';
    case 'HUNTER_RELOADING':
      return 'reloading';
    default:
      return 'standing';
  }
}

/**
 * Determine the facing direction of the hunter
 */
function getHunterFacingDirection(hunter: HunterEntity): 'left' | 'right' {
  return hunter.targetDirection > -Math.PI / 2 && hunter.targetDirection < Math.PI / 2 ? 'right' : 'left';
}

/**
 * Draws the hunter entity on the canvas
 */
export function drawHunter(ctx: CanvasRenderingContext2D, _: GameWorldState, hunter: HunterEntity) {
  const width = HUNTER_WIDTH;
  const height = HUNTER_HEIGHT;
  const position = hunter.position;
  const isMoving = vectorLength(hunter.velocity) > 0.1;

  // Get current state and stance
  const currentStateType = hunter.stateMachine?.[0] || 'HUNTER_PATROLLING';
  const stance = getHunterStance(currentStateType, isMoving);

  Hunter2d.render(
    ctx,
    position.x - width / 2,
    position.y - height / 2,
    width,
    height,
    (Date.now() % 1000) / 1000,
    stance,
    getHunterFacingDirection(hunter),
  );
}

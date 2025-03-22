import { PreyEntity } from '../../game-world/entities/entities-types';

import { Prey2d } from '../../../../../../../tools/asset-generator/generator-assets/src/prey-2d/prey-2d';

function getPreyFacingDirection(prey: PreyEntity): 'left' | 'right' {
  return prey.targetDirection > -Math.PI / 2 && prey.targetDirection < Math.PI / 2 ? 'right' : 'left';
}

export function renderPrey(ctx: CanvasRenderingContext2D, prey: PreyEntity) {
  let stance;

  switch (prey.stateMachine[0]) {
    case 'PREY_IDLE':
      stance = 'standing';
      break;
    case 'PREY_MOVING':
      stance =
        Math.sqrt(prey.velocity.x * prey.velocity.x + prey.velocity.y * prey.velocity.y) > 0.05 ? 'running' : 'walking';
      break;
    case 'PREY_FLEEING':
      stance = 'running';
      break;
    case 'PREY_EATING':
      stance = 'grazing';
      break;
    case 'PREY_DRINKING':
      stance = 'drinking';
      break;
    default:
      stance = 'standing';
  }

  Prey2d.render(
    ctx,
    prey.position.x,
    prey.position.y,
    40,
    40,
    (Date.now() % 1000) / 1000,
    stance,
    getPreyFacingDirection(prey),
  );
}

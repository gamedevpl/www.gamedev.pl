import { CarrionEntity } from '../../game-world/entities/entities-types';

import { Prey2d } from '../../../../../../../tools/asset-generator/generator-assets/src/prey-2d/prey-2d';
import { GameWorldState } from '../../game-world/game-world-types';

export function drawCarrion(ctx: CanvasRenderingContext2D, _: GameWorldState, carrion: CarrionEntity) {
  const width = 30,
    height = 30;

  Prey2d.render(
    ctx,
    carrion.position.x - width / 2,
    carrion.position.y - height / 2,
    width,
    height,
    (Date.now() % 1000) / 1000,
    'carrion',
    'right',
  );
}

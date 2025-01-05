import { GameWorldState } from '../game-world/game-world-types';
import { devConfig } from '../dev/dev-config';
import { getPrey } from '../game-world/game-world-query';

export function renderDebugInfo(ctx: CanvasRenderingContext2D, world: GameWorldState) {
  const prey = getPrey(world);

  if (devConfig.debugVitals) {
    prey.forEach((p) => {
      ctx.save();
      ctx.translate(p.position.x, p.position.y);
      ctx.fillStyle = 'white';
      ctx.font = '12px Arial';
      ctx.fillText(`Health: ${p.health.toFixed(2)}`, 10, -10);
      ctx.fillText(`Hunger: ${p.hungerLevel.toFixed(2)}`, 10, 10);
      ctx.fillText(`Thirst: ${p.thirstLevel.toFixed(2)}`, 10, 30);
      ctx.fillText(`Stamina: ${p.staminaLevel.toFixed(2)}`, 10, 50);
      ctx.restore();
    });
  }
}

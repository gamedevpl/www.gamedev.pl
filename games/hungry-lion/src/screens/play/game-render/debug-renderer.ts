import { GameWorldState } from '../game-world/game-world-types';
import { devConfig } from '../dev/dev-config';

export function renderDebugInfo(ctx: CanvasRenderingContext2D, world: GameWorldState) {
  const { lion, prey } = world;

  if (devConfig.debugCatchingMechanics) {
    prey.forEach((p) => {
      const distance = Math.sqrt(
        Math.pow(p.position.x - lion.position.x, 2) + Math.pow(p.position.y - lion.position.y, 2),
      );
      const isCatchingEffective = distance < 80; // Catch distance threshold

      ctx.save();
      ctx.translate(p.position.x, p.position.y);
      ctx.fillStyle = 'white';
      ctx.font = '12px Arial';
      ctx.fillText(`Distance: ${distance.toFixed(2)}`, 10, -10);
      ctx.fillText(`Catching: ${isCatchingEffective ? 'Effective' : 'Not Effective'}`, 10, 10);
      ctx.fillText('Speed: ' + p.movement.speed.toFixed(2), 10, 30);
      ctx.restore();
    });
  }
}

import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { GameWorldState } from '../world-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { areFamily } from '../utils/world-utils';
import { PLAYER_HIGHLIGHT_COLOR, FAMILY_CLAIM_COLOR, NON_FAMILY_CLAIM_COLOR } from '../world-consts';

const BUSH_RADIUS = 10;
const BERRY_RADIUS = 3;
const BERRY_OFFSET_DISTANCE = BUSH_RADIUS * 0.7;

export function renderBerryBush(
  ctx: CanvasRenderingContext2D,
  bush: BerryBushEntity,
  gameState: GameWorldState,
  player: HumanEntity | undefined,
  time: number,
): void {
  const { position, food, maxFood, ownerId, claimedUntil } = bush;

  // Draw the main bush circle
  ctx.beginPath();
  ctx.arc(position.x, position.y, BUSH_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = '#228B22'; // Forest Green
  ctx.fill();
  ctx.strokeStyle = '#006400'; // Dark Green
  ctx.lineWidth = 1;
  ctx.stroke();

  // Draw pulsing outline if claimed
  if (ownerId && claimedUntil && claimedUntil > time && player) {
    const owner = gameState.entities.entities.get(ownerId) as HumanEntity | undefined;
    if (owner) {
      let claimColor: string | undefined;

      if (owner.id === player.id) {
        claimColor = PLAYER_HIGHLIGHT_COLOR;
      } else if (areFamily(player, owner, gameState)) {
        claimColor = FAMILY_CLAIM_COLOR;
      } else {
        claimColor = NON_FAMILY_CLAIM_COLOR;
      }

      if (claimColor) {
        ctx.strokeStyle = claimColor;
        ctx.lineWidth = 1 + Math.sin(time * 2) * 0.5; // Pulsing effect
        ctx.beginPath();
        ctx.arc(position.x, position.y, BUSH_RADIUS + 2, 0, Math.PI * 2); // Slightly larger radius for the outline
        ctx.stroke();
      }
    }
  }

  // Draw berries around the bush
  if (food.length > 0) {
    const angleStep = (Math.PI * 2) / Math.min(food.length, maxFood); // Distribute berries evenly
    for (let i = 0; i < food.length; i++) {
      const angle = i * angleStep;
      const berryX = position.x + BERRY_OFFSET_DISTANCE * Math.cos(angle);
      const berryY = position.y + BERRY_OFFSET_DISTANCE * Math.sin(angle);

      ctx.beginPath();
      ctx.arc(berryX, berryY, BERRY_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#FF0000'; // Red
      ctx.fill();
    }
  }
}

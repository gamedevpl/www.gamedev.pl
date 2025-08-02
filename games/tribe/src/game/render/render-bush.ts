import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { GameWorldState } from '../world-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { areFamily } from '../utils/world-utils';
import {
  PLAYER_HIGHLIGHT_COLOR,
  FAMILY_CLAIM_COLOR,
  NON_FAMILY_CLAIM_COLOR
} from '../ui-consts.ts';
import { getImageAsset, ImageType } from '../assets/image-loader';

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

  // Try to use Sprout Lands asset, fallback to procedural rendering
  const berryBushAsset = getImageAsset(ImageType.BerryBush);
  
  if (berryBushAsset) {
    // Render using Sprout Lands asset
    const spriteSize = 32; // Size to render the sprite
    ctx.drawImage(
      berryBushAsset.image,
      position.x - spriteSize / 2,
      position.y - spriteSize / 2,
      spriteSize,
      spriteSize
    );
    
    // Draw additional berries if bush has more food than the sprite shows
    if (food.length > 3) { // Assuming the sprite shows ~3 berries
      const extraBerries = food.length - 3;
      const angleStep = (Math.PI * 2) / extraBerries;
      for (let i = 0; i < extraBerries; i++) {
        const angle = i * angleStep;
        const berryX = position.x + BERRY_OFFSET_DISTANCE * Math.cos(angle);
        const berryY = position.y + BERRY_OFFSET_DISTANCE * Math.sin(angle);

        ctx.beginPath();
        ctx.arc(berryX, berryY, BERRY_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = '#FF0000'; // Red
        ctx.fill();
      }
    }
  } else {
    // Fallback to original procedural rendering
    // Draw the main bush circle
    ctx.beginPath();
    ctx.arc(position.x, position.y, BUSH_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#228B22'; // Forest Green
    ctx.fill();
    ctx.strokeStyle = '#006400'; // Dark Green
    ctx.lineWidth = 1;
    ctx.stroke();

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

  // Draw pulsing outline if claimed (works for both asset and procedural rendering)
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
        const outlineRadius = berryBushAsset ? 18 : BUSH_RADIUS + 2; // Adjust for sprite size
        ctx.arc(position.x, position.y, outlineRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}

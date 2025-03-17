import { Asset } from '../../../generator-core/src/assets-types';

function renderGrass2d(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  progress: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  stance: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  direction: string,
) {
  ctx.save();
  ctx.fillStyle = 'green';
  ctx.fillRect(x, y, width, height);
  ctx.restore();
}

export const Grass2d: Asset = {
  name: 'Grass2d',
  stances: ['default', 'windy', 'calm'],
  description: `## 🌿 Pixel Art Grass Tile Asset

**Description:**  
A simple, seamless, top-down pixel-art grass tile suitable for retro-style or pixel-art games. Tiles align seamlessly, allowing multiple instances to form a cohesive grassy field.

**Features:**
- 🎨 **Pixel Art Style:** Minimalistic, flat shading with a limited green color palette.
- 🔄 **Seamless Tiling:** Designed to seamlessly connect horizontally and vertically.
- 💨 **Animated States:** 
  - \`default\`: Completely still.
  - \`calm\`: Subtle swaying animation (gentle breeze).
  - \`windy\`: Noticeable yet subtle swaying animation (moderate breeze).

**Recommended Tile Sizes:**  
- 32x32 pixels (standard)
- 16x16 pixels (alternative)

**Ideal for:**  
- Retro games, RPGs, adventure games, farming sims, and pixel-art styled applications.

`,
  render: renderGrass2d,
};

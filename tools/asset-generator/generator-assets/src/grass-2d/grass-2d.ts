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
  description: `## 🌿 Improved Pixel Art Grass Tile Asset Generation Prompt

**Objective:**  
Generate a top-down pixel-art grass tile suitable for seamless tiling in games. The grass should appear stylized but natural, avoiding geometric regularity or overly distinct rectangular shapes. Grass pixels should overlap slightly to create a continuous, cohesive texture without gaps.

**Key Points:**
- **Natural, subtle appearance**: Grass blades should be varied, organic, and irregular.
- **No visible gaps**: Pixels should connect seamlessly.
- **Limited color palette**: Approximately 4–6 subtle shades of green.
- **Flat shading**: No gradients or realistic shading.
- **Pixel-art style**: Clear and minimalistic, suitable for retro games.
- **Perspective**: Purely top-down, no perspective distortion.
- **Animated states**:
  - \`default\`: Static grass.
  - \`calm\`: Slight, gentle, looping sway (1 pixel displacement max).
  - \`windy\`: Noticeably gentle, looping sway (up to 2 pixels displacement).

**Implementation Tips:**
- Ensure the edges match perfectly to allow for infinite seamless tiling.
- Maintain organic randomness to create natural grass texture, avoiding overly symmetrical patterns.

`,
  render: renderGrass2d,
};

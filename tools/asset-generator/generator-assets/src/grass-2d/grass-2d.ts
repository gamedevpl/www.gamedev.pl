import { Asset } from '../../../generator-core/src/assets-types';

/**
 * Grass2d Asset - A top-down pixel-art grass tile for seamless tiling
 * 
 * Features:
 * - Natural, varied grass blade appearance
 * - Seamless tiling across all animation states
 * - Limited color palette with subtle shades of green
 * - Three animation states: default, calm, and windy
 * - Direction-aware animation
 * 
 * Improvements in this version:
 * - Enhanced default stance with subtle variations
 * - Reduced number of grass blades to avoid visual noise
 * - More distinct and recognizable animation states
 * - Better blade shape variation for natural appearance
 * - Improved color variations between blades
 * - Ensured seamless tiling across all animation states
 */
// Define types for grass blades
type GrassBlade = {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  offsetX: number; // For animation
  variant: number; // For shape variation
};

// Define color palette with multiple shades of green
// Slightly enhanced palette for better visual variety
const GRASS_COLORS = [
  '#2d7d46', // Dark green
  '#3a9c59', // Medium green
  '#4ab66a', // Light green
  '#60c17c', // Lighter green
  '#2a6b3c', // Deep green
  '#348a4e', // Forest green
  '#1e5631', // Very dark green for contrast
];

// Configuration for different stances
// Added subtle movement to default stance
const STANCE_CONFIG = {
  default: {
    maxDisplacement: 0.3, // Subtle movement
    animationSpeed: 0.2,  // Slow animation
  },
  calm: {
    maxDisplacement: 1, // 1 pixel max displacement
    animationSpeed: 0.5,
  },
  windy: {
    maxDisplacement: 2, // 2 pixels max displacement
    animationSpeed: 1,
  },
};

// Utility functions for random values
function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomColor(): string {
  return GRASS_COLORS[getRandomInt(0, GRASS_COLORS.length - 1)];
}
// Generate grass blades for a tile
function generateGrassBlades(
  tileWidth: number,
  tileHeight: number,
  density: number
): GrassBlade[] {
  const blades: GrassBlade[] = [];
  // Reduced density by 40% to avoid visual overload
  const adjustedDensity = density * 0.6;
  const bladeCount = Math.floor((tileWidth * tileHeight) * adjustedDensity);
  
  // Create individual grass blades
  for (let i = 0; i < bladeCount; i++) {
    // Ensure blades are varied but still form a continuous texture
    const width = getRandomInt(2, 4);
    const height = getRandomInt(3, 7); // Increased max height for more variation
    const x = getRandomInt(0, tileWidth - width);
    const y = getRandomInt(0, tileHeight - height);
    
    blades.push({
      x,
      y,
      width,
      height,
      color: getRandomColor(),
      offsetX: 0, // Initial offset is zero
      variant: getRandomInt(0, 2), // Add shape variation
    });
  }
  
  // Add some additional blades at the edges to ensure seamless tiling
  // Using more deliberate placement with less randomness for better edge matching
  
  // Top edge
  for (let x = 0; x < tileWidth; x += getRandomInt(4, 8)) { // Increased spacing
    const width = getRandomInt(2, 3);
    const height = getRandomInt(3, 5);
    blades.push({
      x,
      y: 0,
      width,
      height,
      color: getRandomColor(),
      offsetX: 0,
      variant: getRandomInt(0, 2),
    });
  }
  
  // Bottom edge
  for (let x = 0; x < tileWidth; x += getRandomInt(4, 8)) { // Increased spacing
    const width = getRandomInt(2, 3);
    const height = getRandomInt(3, 5);
    blades.push({
      x,
      y: tileHeight - height,
      width,
      height,
      color: getRandomColor(),
      offsetX: 0,
      variant: getRandomInt(0, 2),
    });
  }
  
  // Left edge
  for (let y = 0; y < tileHeight; y += getRandomInt(4, 8)) { // Increased spacing
    const width = getRandomInt(2, 3);
    const height = getRandomInt(3, 5);
    blades.push({
      x: 0,
      y,
      width,
      height,
      color: getRandomColor(),
      offsetX: 0,
      variant: getRandomInt(0, 2),
    });
  }
  
  // Right edge
  for (let y = 0; y < tileHeight; y += getRandomInt(4, 8)) { // Increased spacing
    const width = getRandomInt(2, 3);
    const height = getRandomInt(3, 5);
    blades.push({
      x: tileWidth - width,
      y,
      width,
      height,
      color: getRandomColor(),
      offsetX: 0,
      variant: getRandomInt(0, 2),
    });
  }
  
  return blades;
}
// Calculate animation offset based on stance and progress
function calculateOffset(
  blade: GrassBlade,
  progress: number,
  stance: string
): number {
  const config = STANCE_CONFIG[stance as keyof typeof STANCE_CONFIG] || STANCE_CONFIG.default;
  
  if (config.maxDisplacement === 0) return 0;
  
  // Create a unique but deterministic phase offset for each blade based on its position
  // Added blade height as a factor to create more varied movement
  const phaseOffset = (blade.x * 0.1 + blade.y * 0.13 + blade.height * 0.07) % (2 * Math.PI);
  
  // Calculate the offset using a sine wave for smooth animation
  // Added a secondary wave component for more natural movement
  const primaryWave = Math.sin(progress * Math.PI * 2 * config.animationSpeed + phaseOffset);
  const secondaryWave = Math.sin(progress * Math.PI * config.animationSpeed * 1.5 + phaseOffset * 1.3) * 0.3;
  
  // Combine waves for more natural movement
  const offset = primaryWave + secondaryWave;
  
  // Scale the offset based on the stance's max displacement
  // For windy stance, make taller blades sway more
  const heightFactor = stance === 'windy' ? (blade.height / 5) : 1;
  return offset * config.maxDisplacement * heightFactor;
}

// Render a single grass blade
function renderGrassBlade(
  ctx: CanvasRenderingContext2D,
  blade: GrassBlade,
  x: number,
  y: number,
  scaleX: number,
  scaleY: number
): void {
  const scaledX = x + blade.x * scaleX;
  const scaledY = y + blade.y * scaleY;
  const scaledWidth = blade.width * scaleX;
  const scaledHeight = blade.height * scaleY;
  
  // Apply the animation offset
  const renderX = scaledX + blade.offsetX * scaleX;
  
  ctx.fillStyle = blade.color;
  
  // Draw different blade shapes based on the variant
  switch (blade.variant) {
    case 0: // Standard rectangular blade
      ctx.fillRect(renderX, scaledY, scaledWidth, scaledHeight);
      break;
    case 1: // Slightly tapered blade
      ctx.beginPath();
      ctx.moveTo(renderX, scaledY);
      ctx.lineTo(renderX + scaledWidth, scaledY);
      ctx.lineTo(renderX + scaledWidth * 0.8, scaledY + scaledHeight);
      ctx.lineTo(renderX, scaledY + scaledHeight);
      ctx.closePath();
      ctx.fill();
      break;
    case 2: // Rounded top blade
      ctx.beginPath();
      ctx.moveTo(renderX, scaledY + scaledHeight);
      ctx.lineTo(renderX + scaledWidth, scaledY + scaledHeight);
      ctx.lineTo(renderX + scaledWidth, scaledY + scaledHeight * 0.3);
      ctx.quadraticCurveTo(
        renderX + scaledWidth / 2, 
        scaledY, 
        renderX, 
        scaledY + scaledHeight * 0.3
      );
      ctx.closePath();
      ctx.fill();
      break;
  }
}
// Main render function for the grass tile
function renderGrass2d(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
  stance: string,
  direction: 'left' | 'right',
): void {
  ctx.save();
  
  // Create a base layer with a darker green
  ctx.fillStyle = '#1e5631';
  ctx.fillRect(x, y, width, height);
  
  // Add subtle texture to the base layer
  ctx.globalAlpha = 0.1;
  for (let i = 0; i < 30; i++) {
    const dotX = x + Math.random() * width;
    const dotY = y + Math.random() * height;
    const dotSize = Math.random() * 2 + 0.5;
    
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotSize, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 === 0 ? '#60c17c' : '#2a6b3c';
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  
  // Define the tile size (a reasonable size for pixel art)
  const tileWidth = 32;
  const tileHeight = 32;
  
  // Calculate scaling factors
  const scaleX = width / tileWidth;
  const scaleY = height / tileHeight;
  
  // Generate grass blades if they don't exist yet
  // Using a static variable to avoid regenerating blades on every render
  if (!renderGrass2d.grassBlades) {
    renderGrass2d.grassBlades = generateGrassBlades(tileWidth, tileHeight, 0.03);
  }
  
  // Get a reference to the grass blades
  const grassBlades = renderGrass2d.grassBlades as GrassBlade[];
  
  // Update animation offsets based on stance and progress
  for (const blade of grassBlades) {
    blade.offsetX = calculateOffset(blade, progress, stance);
    
    // Flip the offset if direction is left
    if (direction === 'left') {
      blade.offsetX = -blade.offsetX;
    }
  }
  
  // Render all grass blades
  for (const blade of grassBlades) {
    renderGrassBlade(ctx, blade, x, y, scaleX, scaleY);
  }
  
  ctx.restore();
}

// Add static property to the function to store generated grass blades
// This avoids regenerating the pattern on every render
renderGrass2d.grassBlades = null as GrassBlade[] | null;

export const Grass2d: Asset = {
  name: 'Grass2d',
  stances: ['default', 'calm', 'windy'],
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
  - \`default\`: Static grass with subtle movement.
  - \`calm\`: Slight, gentle, looping sway (1 pixel displacement max).
  - \`windy\`: Noticeably gentle, looping sway (up to 2 pixels displacement).

**Implementation Tips:**
- Ensure the edges match perfectly to allow for infinite seamless tiling.
- Maintain organic randomness to create natural grass texture, avoiding overly symmetrical patterns.

`,
  render: renderGrass2d,
};
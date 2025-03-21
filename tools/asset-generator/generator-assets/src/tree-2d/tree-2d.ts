import { Asset } from '../../../generator-core/src/assets-types';

// Type definitions for tree configuration
interface TreeConfig {
  trunkColor: string;
  darkLeafColor: string;
  midLeafColor: string;
  lightLeafColor: string;
  trunkWidth: number;
  trunkHeight: number;
  canopyWidth: number;
  canopyHeight: number;
}

// Type for tree component parts
interface TreeParts {
  trunk: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  canopy: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// Constants for tree colors
const TREE_COLORS = {
  trunk: '#5E4326',
  darkLeaf: '#0F5F23',
  midLeaf: '#157F2D',
  lightLeaf: '#25A244',
};

// Default tree configuration
const DEFAULT_TREE_CONFIG: TreeConfig = {
  trunkColor: TREE_COLORS.trunk,
  darkLeafColor: TREE_COLORS.darkLeaf,
  midLeafColor: TREE_COLORS.midLeaf,
  lightLeafColor: TREE_COLORS.lightLeaf,
  trunkWidth: 0.2, // Relative to total width
  trunkHeight: 0.4, // Relative to total height
  canopyWidth: 0.8, // Relative to total width
  canopyHeight: 0.7, // Relative to total height
};

/**
 * Calculates the tree parts dimensions based on total dimensions and config
 */
function calculateTreeParts(
  x: number, 
  y: number, 
  width: number, 
  height: number, 
  config: TreeConfig
): TreeParts {
  const trunkWidth = width * config.trunkWidth;
  const trunkHeight = height * config.trunkHeight;
  const canopyWidth = width * config.canopyWidth;
  const canopyHeight = height * config.canopyHeight;
  
  return {
    trunk: {
      x: x + (width - trunkWidth) / 2,
      y: y + height - trunkHeight,
      width: trunkWidth,
      height: trunkHeight
    },
    canopy: {
      x: x + (width - canopyWidth) / 2,
      y: y + height - trunkHeight - canopyHeight * 0.9, // Overlap trunk slightly
      width: canopyWidth,
      height: canopyHeight
    }
  };
}
/**
 * Draws the tree trunk
 */
function drawTrunk(
  ctx: CanvasRenderingContext2D,
  trunkData: TreeParts['trunk'],
  color: string
): void {
  const { x, y, width, height } = trunkData;
  
  // Draw main trunk
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + height);
  ctx.lineTo(x + width, y + height);
  ctx.lineTo(x + width * 0.9, y);
  ctx.lineTo(x + width * 0.1, y);
  ctx.closePath();
  ctx.fill();
  
  // Add some trunk detail
  ctx.fillStyle = adjustColor(color, -20);
  ctx.beginPath();
  ctx.moveTo(x + width * 0.3, y + height);
  ctx.lineTo(x + width * 0.4, y + height * 0.2);
  ctx.lineTo(x + width * 0.45, y + height * 0.2);
  ctx.lineTo(x + width * 0.35, y + height);
  ctx.closePath();
  ctx.fill();
}

/**
 * Draws the tree canopy (leaves)
 */
function drawCanopy(
  ctx: CanvasRenderingContext2D,
  canopyData: TreeParts['canopy'],
  colors: { dark: string; mid: string; light: string },
  progress: number,
  stance: string
): void {
  const { x, y, width, height } = canopyData;
  
  // Apply animation transformations based on stance
  ctx.save();
  
  // Apply different animation based on stance
  if (stance === 'default') {
    applyDefaultAnimation(ctx, x + width / 2, y + height, progress);
  } else if (stance === 'calm') {
    applyCalmAnimation(ctx, x + width / 2, y + height, progress);
  } else if (stance === 'windy') {
    applyWindyAnimation(ctx, x + width / 2, y + height, progress);
  }
  
  // Draw base canopy shape (darkest color)
  ctx.fillStyle = colors.dark;
  drawCanopyLayer(ctx, x, y, width, height, 0);
  
  // Draw middle layer
  ctx.fillStyle = colors.mid;
  drawCanopyLayer(ctx, x + width * 0.1, y + height * 0.1, width * 0.8, height * 0.8, 0);
  
  // Draw top layer (lightest color)
  ctx.fillStyle = colors.light;
  drawCanopyLayer(ctx, x + width * 0.2, y + height * 0.2, width * 0.6, height * 0.6, 0);
  
  ctx.restore();
}

/**
 * Draws a single canopy layer in pseudo-isometric style
 */
function drawCanopyLayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  offset: number
): void {
  const centerX = x + width / 2;
  
  ctx.beginPath();
  
  // Draw a somewhat triangular shape for the canopy
  ctx.moveTo(centerX, y);
  ctx.lineTo(x + width * 0.9, y + height * 0.4);
  ctx.lineTo(x + width, y + height * 0.8);
  ctx.lineTo(centerX, y + height);
  ctx.lineTo(x, y + height * 0.8);
  ctx.lineTo(x + width * 0.1, y + height * 0.4);
  
  ctx.closePath();
  ctx.fill();
}

/**
 * Apply subtle "breathing" animation for default stance
 */
function applyDefaultAnimation(
  ctx: CanvasRenderingContext2D,
  pivotX: number,
  pivotY: number,
  progress: number
): void {
  const breathingFactor = Math.sin(progress * Math.PI * 2) * 0.01 + 1;
  ctx.translate(pivotX, pivotY);
  ctx.scale(breathingFactor, breathingFactor);
  ctx.translate(-pivotX, -pivotY);
}
/**
 * Apply gentle swaying animation for calm stance
 */
function applyCalmAnimation(
  ctx: CanvasRenderingContext2D,
  pivotX: number,
  pivotY: number,
  progress: number
): void {
  const swayAngle = Math.sin(progress * Math.PI * 2) * 0.03;
  ctx.translate(pivotX, pivotY);
  ctx.rotate(swayAngle);
  ctx.translate(-pivotX, -pivotY);
}

/**
 * Apply dramatic swaying animation for windy stance
 */
function applyWindyAnimation(
  ctx: CanvasRenderingContext2D,
  pivotX: number,
  pivotY: number,
  progress: number
): void {
  // Primary sway
  const primarySway = Math.sin(progress * Math.PI * 3) * 0.08;
  // Secondary faster, smaller sway
  const secondarySway = Math.sin(progress * Math.PI * 6) * 0.03;
  
  const totalSway = primarySway + secondarySway;
  
  ctx.translate(pivotX, pivotY);
  ctx.rotate(totalSway);
  ctx.translate(-pivotX, -pivotY);
  
  // Add a slight squish effect
  const squishX = 1 + Math.sin(progress * Math.PI * 3) * 0.05;
  const squishY = 1 - Math.sin(progress * Math.PI * 3) * 0.03;
  ctx.scale(squishX, squishY);
}

/**
 * Utility function to adjust a color's brightness
 */
function adjustColor(color: string, amount: number): string {
  // Convert hex to RGB
  let r = parseInt(color.substring(1, 3), 16);
  let g = parseInt(color.substring(3, 5), 16);
  let b = parseInt(color.substring(5, 7), 16);
  
  // Adjust RGB values
  r = Math.max(0, Math.min(255, r + amount));
  g = Math.max(0, Math.min(255, g + amount));
  b = Math.max(0, Math.min(255, b + amount));
  
  // Convert back to hex
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Draw a shadow beneath the tree
 */
function drawShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const shadowX = x + width * 0.1;
  const shadowY = y + height * 0.9;
  const shadowWidth = width * 0.8;
  const shadowHeight = height * 0.15;
  
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.beginPath();
  ctx.ellipse(
    shadowX + shadowWidth / 2,
    shadowY + shadowHeight / 2,
    shadowWidth / 2,
    shadowHeight / 2,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.restore();
}

/**
 * Tree-2D Asset implementation
 */
export const Tree2D: Asset = {
  name: 'Tree-2D',
  description: `## A simple 2D tree asset.
  
# Style

Pixel art style tree with a pseudo-isometric perspective.

# Projection

Pseudo isometric projection that gives a slight 3D feel to the 2D tree.

# Stances

- **default**: Default stance, the tree has a very subtle breathing animation to make it feel alive.
- **calm**: Calm stance, the tree leaves sway gently in a light breeze.
- **windy**: Windy stance, the tree leaves sway dramatically in stronger wind with enhanced movement.

# Usage

This tree asset can be used in various 2D game environments, particularly those with a top-down or isometric perspective. The different stances allow for environmental effects like wind to be represented visually.

# Rendering

Apply padding around the tree to ensure it fits within the designated space. The tree will be rendered with the specified stance and animation progress.`,
  
  stances: ['default', 'calm', 'windy'],
  
  render: (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    progress: number,
    stance: string,
    direction: 'left' | 'right'
  ): void => {
    // Apply padding to ensure the tree fits within the space
    const padding = Math.min(width, height) * 0.1;
    const paddedX = x + padding;
    const paddedY = y + padding;
    const paddedWidth = width - padding * 2;
    const paddedHeight = height - padding * 2;
    
    // Calculate tree parts dimensions
    const treeParts = calculateTreeParts(
      paddedX,
      paddedY,
      paddedWidth,
      paddedHeight,
      DEFAULT_TREE_CONFIG
    );
    
    // Handle direction
    ctx.save();
    if (direction === 'left') {
      ctx.translate(x + width, 0);
      ctx.scale(-1, 1);
      ctx.translate(-x, 0);
    }
    
    // Draw shadow first (underneath everything)
    drawShadow(ctx, paddedX, paddedY, paddedWidth, paddedHeight);
    
    // Draw tree trunk
    drawTrunk(
      ctx,
      treeParts.trunk,
      DEFAULT_TREE_CONFIG.trunkColor
    );
    
    // Draw tree canopy
    drawCanopy(
      ctx,
      treeParts.canopy,
      {
        dark: DEFAULT_TREE_CONFIG.darkLeafColor,
        mid: DEFAULT_TREE_CONFIG.midLeafColor,
        light: DEFAULT_TREE_CONFIG.lightLeafColor
      },
      progress,
      stance
    );
    
    ctx.restore();
  }
};
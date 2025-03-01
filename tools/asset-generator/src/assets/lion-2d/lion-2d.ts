import { Asset, AssetAnimationState } from '../assets-types';

export interface LionAnimationState extends AssetAnimationState {
  stance: 'standing' | 'walking' | 'running' | 'sleeping' | 'idle';
  direction?: 'left' | 'right';
  // Added customization options
  scale?: number;
  colorVariant?: 'default' | 'golden' | 'white';
}

const INITIAL_LION_STATE: LionAnimationState = {
  progress: 0,
  stance: 'standing',
  direction: 'right',
  scale: 1,
  colorVariant: 'default',
};

// Color palettes for different variants
const COLOR_PALETTES = {
  default: {
    body: '#e8b06d',
    mane: '#a56d27',
    darkMane: '#7a4e1d',
    outline: '#3a2e1d',
    eye: '#2c2c2c',
    nose: '#2c2c2c',
    mouth: '#7a4e1d',
    paw: '#c99c5e',
    tail: '#c99c5e',
    tailTip: '#7a4e1d',
  },
  golden: {
    body: '#ffd700',
    mane: '#ff8c00',
    darkMane: '#cd6600',
    outline: '#3a2e1d',
    eye: '#2c2c2c',
    nose: '#2c2c2c',
    mouth: '#8b4513',
    paw: '#ffc125',
    tail: '#ffc125',
    tailTip: '#cd6600',
  },
  white: {
    body: '#f8f8ff',
    mane: '#e6e6fa',
    darkMane: '#d8bfd8',
    outline: '#696969',
    eye: '#2c2c2c',
    nose: '#2c2c2c',
    mouth: '#a9a9a9',
    paw: '#f0f0f0',
    tail: '#f0f0f0',
    tailTip: '#d8bfd8',
  },
};

// Pre-calculated animation values for performance
const ANIMATION_LOOKUP = {
  legOffset: {
    standing: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.2 * Math.PI * 2) * 1),
    walking: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 2 * Math.PI * 2) * 3),
    running: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 4 * Math.PI * 2) * 5),
    idle: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.1 * Math.PI * 2) * 0.5),
    sleeping: Array.from({ length: 100 }, () => 0),
  },
  bodyOffset: {
    standing: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.5 * Math.PI * 2) * 0.5),
    walking: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 2 * Math.PI * 2) * 1),
    running: Array.from({ length: 100 }, (_, i) => Math.abs(Math.sin((i / 100) * 4 * Math.PI * 2)) * 2),
    idle: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.3 * Math.PI * 2) * 0.3),
    sleeping: Array.from({ length: 100 }, () => 0),
  },
  tailAngle: {
    standing: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.5 * Math.PI * 2) * 0.2),
    walking: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 2 * Math.PI * 2) * 0.5),
    running: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 3 * Math.PI * 2) * 0.8),
    idle: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.2 * Math.PI * 2) * 0.15),
    sleeping: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.1 * Math.PI * 2) * 0.05),
  },
};

export const Lion2d: Asset<LionAnimationState> = {
  name: 'lion-2d',
  stances: ['standing', 'walking', 'running', 'idle', 'sleeping'],
  description: `# Two dimensional representation of a lion game asset

# Projecting a lion in a 2D space

Lion is rendered from the side view in a 2D space.

# Style

Cartoon style, with a focus on simplicity and clarity.
Limited color palette and bold outlines.

# Animation States

- standing: Default pose with subtle movement
- walking: Moderate leg movement and body bounce
- running: Exaggerated leg movement and pronounced bounce
- idle: Very subtle movements showing the lion at rest
- sleeping: Lion in a sleeping pose

# Customization

- scale: Adjust the overall size of the lion
- colorVariant: Choose from default, golden, or white color schemes
`,
  render: (ctx: CanvasRenderingContext2D, animationState: LionAnimationState = INITIAL_LION_STATE): void => {
    let { progress, stance, direction, scale = 1, colorVariant = 'default' } = animationState;
    stance = stance || 'standing';
    direction = direction || 'right';

    // Get appropriate color palette
    const colors = COLOR_PALETTES[colorVariant];

    // Convert progress to index for lookup tables (0-99)
    const lookupIndex = Math.floor((progress % 1) * 100);

    // Get animation values from lookup tables
    const legOffset = ANIMATION_LOOKUP.legOffset[stance][lookupIndex];
    const bodyOffset = ANIMATION_LOOKUP.bodyOffset[stance][lookupIndex];
    const tailAngle = ANIMATION_LOOKUP.tailAngle[stance][lookupIndex];

    // Save the current context state
    ctx.save();

    // Apply scaling
    ctx.scale(scale, scale);

    // Handle direction (flip if facing left)
    if (direction === 'left') {
      ctx.scale(-1, 1);
      ctx.translate(-100, 0);
    }

    // Handle sleeping stance separately
    if (stance === 'sleeping') {
      drawSleepingLion(ctx, colors);
    } else {
      // Draw the lion
      drawTail(ctx, tailAngle, colors);
      drawHindLeg(ctx, legOffset, colors);
      drawBody(ctx, bodyOffset, colors);
      drawMane(ctx, bodyOffset, colors);
      drawHead(ctx, bodyOffset, stance, colors);
      drawFrontLeg(ctx, legOffset, colors);
    }

    // Restore the context state
    ctx.restore();
  },
};

// Helper function to draw the sleeping lion
function drawSleepingLion(ctx: CanvasRenderingContext2D, colors: typeof COLOR_PALETTES.default): void {
  // Body (lying down)
  ctx.fillStyle = colors.body;
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.ellipse(50, 70, 30, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Head (resting)
  ctx.fillStyle = colors.body;
  ctx.beginPath();
  ctx.ellipse(75, 65, 10, 8, Math.PI * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Mane
  ctx.fillStyle = colors.mane;
  ctx.beginPath();
  ctx.ellipse(70, 63, 12, 10, Math.PI * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Darker inner mane
  ctx.fillStyle = colors.darkMane;
  ctx.beginPath();
  ctx.ellipse(72, 63, 8, 7, Math.PI * 0.1, 0, Math.PI * 2);
  ctx.fill();

  // Closed eye (as a line)
  ctx.strokeStyle = colors.eye;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(78, 61);
  ctx.lineTo(82, 60);
  ctx.stroke();

  // Nose
  ctx.fillStyle = colors.nose;
  ctx.beginPath();
  ctx.ellipse(84, 64, 2, 1.5, Math.PI * 0.1, 0, Math.PI * 2);
  ctx.fill();

  // Front leg (tucked)
  ctx.fillStyle = colors.paw;
  ctx.beginPath();
  ctx.ellipse(65, 78, 8, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Hind leg (tucked)
  ctx.beginPath();
  ctx.ellipse(35, 78, 8, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Tail (curled)
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(20, 70);
  ctx.bezierCurveTo(15, 60, 10, 60, 15, 70);
  ctx.stroke();

  // Tail tip
  ctx.fillStyle = colors.tailTip;
  ctx.beginPath();
  ctx.ellipse(15, 70, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.stroke();

  // Z's for sleeping (optional)
  ctx.strokeStyle = '#3a2e1d';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(88, 50);
  ctx.lineTo(93, 48);
  ctx.lineTo(90, 45);
  ctx.moveTo(93, 45);
  ctx.lineTo(98, 43);
  ctx.lineTo(95, 40);
  ctx.stroke();
}

function drawBody(ctx: CanvasRenderingContext2D, offset: number, colors: typeof COLOR_PALETTES.default): void {
  ctx.fillStyle = colors.body;
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.ellipse(50, 50 + offset, 25, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawMane(ctx: CanvasRenderingContext2D, offset: number, colors: typeof COLOR_PALETTES.default): void {
  ctx.fillStyle = colors.mane;
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 2;

  // Main mane
  ctx.beginPath();
  ctx.ellipse(70, 45 + offset, 18, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Darker inner mane details
  ctx.fillStyle = colors.darkMane;
  ctx.beginPath();
  ctx.ellipse(72, 45 + offset, 12, 15, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  offset: number,
  stance: string,
  colors: typeof COLOR_PALETTES.default,
): void {
  // Head
  ctx.fillStyle = colors.body;
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.ellipse(80, 40 + offset, 10, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Eye - blink occasionally for idle stance
  ctx.fillStyle = colors.eye;
  if (stance === 'idle' && Math.random() > 0.9) {
    // Blinking
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(83, 37 + offset);
    ctx.lineTo(87, 37 + offset);
    ctx.stroke();
  } else {
    // Normal eye
    ctx.beginPath();
    ctx.ellipse(85, 37 + offset, 2, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Nose
  ctx.fillStyle = colors.nose;
  ctx.beginPath();
  ctx.ellipse(88, 42 + offset, 2, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Mouth - different for different stances
  ctx.strokeStyle = colors.mouth;
  ctx.lineWidth = 1;
  ctx.beginPath();

  if (stance === 'running') {
    // Open mouth for running
    ctx.moveTo(88, 43 + offset);
    ctx.lineTo(85, 46 + offset);
    ctx.lineTo(88, 46 + offset);
  } else {
    // Normal mouth
    ctx.moveTo(88, 43 + offset);
    ctx.lineTo(85, 45 + offset);
  }
  ctx.stroke();
}

function drawFrontLeg(ctx: CanvasRenderingContext2D, offset: number, colors: typeof COLOR_PALETTES.default): void {
  ctx.fillStyle = colors.paw;
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 2;

  // Front leg
  ctx.beginPath();
  ctx.roundRect(65, 60 + offset, 6, 20, 3);
  ctx.fill();
  ctx.stroke();

  // Paw
  ctx.beginPath();
  ctx.ellipse(68, 80 + offset, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawHindLeg(ctx: CanvasRenderingContext2D, offset: number, colors: typeof COLOR_PALETTES.default): void {
  ctx.fillStyle = colors.paw;
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 2;

  // Hind leg
  ctx.beginPath();
  ctx.roundRect(30, 60 - offset, 7, 20, 3);
  ctx.fill();
  ctx.stroke();

  // Paw
  ctx.beginPath();
  ctx.ellipse(33.5, 80 - offset, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawTail(ctx: CanvasRenderingContext2D, tailAngle: number, colors: typeof COLOR_PALETTES.default): void {
  ctx.fillStyle = colors.tail;
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 2;

  ctx.save();
  ctx.translate(25, 45);
  ctx.rotate(tailAngle);

  // Tail
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-15, 5, -25, -5, -30, -15);
  ctx.lineWidth = 4;
  ctx.stroke();

  // Tail tip
  ctx.fillStyle = colors.tailTip;
  ctx.beginPath();
  ctx.ellipse(-30, -15, 5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

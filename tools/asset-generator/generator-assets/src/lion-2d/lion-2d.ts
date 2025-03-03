import { Asset, AssetAnimationState } from '../../../generator-core/src/assets-types';

export interface LionAnimationState extends AssetAnimationState {
  stance: 'standing' | 'walking' | 'running' | 'sleeping' | 'idle';
  direction?: 'left' | 'right';
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
    shadow: 'rgba(58, 46, 29, 0.3)',
    highlight: '#f9d9a8',
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
    shadow: 'rgba(58, 46, 29, 0.3)',
    highlight: '#fffacd',
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
    shadow: 'rgba(105, 105, 105, 0.3)',
    highlight: '#ffffff',
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
    sleeping: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.05 * Math.PI * 2) * 0.2),
  },
  tailAngle: {
    standing: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.5 * Math.PI * 2) * 0.2),
    walking: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 2 * Math.PI * 2) * 0.5),
    running: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 3 * Math.PI * 2) * 0.8),
    idle: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.2 * Math.PI * 2) * 0.15),
    sleeping: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.1 * Math.PI * 2) * 0.05),
  },
  blinkRate: {
    standing: 0.02,
    walking: 0.01,
    running: 0.005,
    idle: 0.1,
    sleeping: 1,
  },
  breathingRate: {
    standing: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.3 * Math.PI * 2) * 0.5),
    walking: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.5 * Math.PI * 2) * 0.3),
    running: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 1 * Math.PI * 2) * 0.8),
    idle: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.2 * Math.PI * 2) * 0.4),
    sleeping: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.1 * Math.PI * 2) * 1),
  },
};

export const Lion2d: Asset<LionAnimationState, {}> = {
  name: 'lion-2d',
  stances: ['standing', 'walking', 'running', 'idle', 'sleeping'],
  defaultState: INITIAL_LION_STATE,
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

  getPropertyControls() {
    return {
      stance: {
        type: 'enum',
        label: 'Stance',
        options: [
          { value: 'standing', label: 'Standing' },
          { value: 'walking', label: 'Walking' },
          { value: 'running', label: 'Running' },
          { value: 'idle', label: 'Idle' },
          { value: 'sleeping', label: 'Sleeping' },
        ],
      },
      direction: {
        type: 'enum',
        label: 'Direction',
        options: [
          { value: 'right', label: 'Right' },
          { value: 'left', label: 'Left' },
        ],
      },
      scale: {
        type: 'number',
        label: 'Scale',
        min: 0.5,
        max: 2,
        step: 0.1,
      },
      colorVariant: {
        type: 'enum',
        label: 'Color Variant',
        options: [
          { value: 'default', label: 'Default' },
          { value: 'golden', label: 'Golden' },
          { value: 'white', label: 'White' },
        ],
      },
    };
  },

  render(ctx: CanvasRenderingContext2D, animationState?: LionAnimationState): void {
    const {
      progress = 0,
      stance = 'standing',
      direction = 'right',
      scale = 1,
      colorVariant = 'default',
    } = animationState ?? INITIAL_LION_STATE;

    // Get appropriate color palette
    const colors = COLOR_PALETTES[colorVariant];

    // Convert progress to index for lookup tables (0-99)
    const lookupIndex = Math.floor((progress % 1) * 100);

    // Get animation values from lookup tables
    const legOffset = ANIMATION_LOOKUP.legOffset[stance][lookupIndex];
    const bodyOffset = ANIMATION_LOOKUP.bodyOffset[stance][lookupIndex];
    const tailAngle = ANIMATION_LOOKUP.tailAngle[stance][lookupIndex];
    const breathingOffset = ANIMATION_LOOKUP.breathingRate[stance][lookupIndex];
    const blinkRate = ANIMATION_LOOKUP.blinkRate[stance];
    const isBlinking = Math.random() < blinkRate;

    // Save the current context state
    ctx.save();

    // Apply scaling
    ctx.scale(scale, scale);

    // Handle direction (flip if facing left)
    if (direction === 'left') {
      ctx.scale(-1, 1);
      ctx.translate(-100, 0);
    }

    // Draw shadow first (under everything)
    drawShadow(ctx, stance, bodyOffset, colors);

    // Handle sleeping stance separately
    if (stance === 'sleeping') {
      drawSleepingLion(ctx, colors, breathingOffset, isBlinking);
    } else {
      // Draw the lion in layers from back to front
      drawTail(ctx, tailAngle, colors);
      drawHindLeg(ctx, legOffset, colors);
      drawBody(ctx, bodyOffset, breathingOffset, colors);
      drawMane(ctx, bodyOffset, colors);
      drawHead(ctx, bodyOffset, stance, isBlinking, colors);
      drawFrontLeg(ctx, legOffset, colors);
    }

    // Restore the context state
    ctx.restore();
  },
};

function drawShadow(
  ctx: CanvasRenderingContext2D,
  stance: string,
  bodyOffset: number,
  colors: typeof COLOR_PALETTES.default,
): void {
  ctx.fillStyle = colors.shadow;

  if (stance === 'sleeping') {
    // Oval shadow beneath sleeping lion
    ctx.beginPath();
    ctx.ellipse(50, 82, 35, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Dynamic shadow that moves with the lion
    ctx.beginPath();
    ctx.ellipse(50, 82, 25 + Math.abs(bodyOffset), 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSleepingLion(
  ctx: CanvasRenderingContext2D,
  colors: typeof COLOR_PALETTES.default,
  breathingOffset: number,
  isBlinking: boolean,
): void {
  // Body (lying down) with breathing animation
  ctx.fillStyle = colors.body;
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.ellipse(50, 70, 30, 12 + breathingOffset, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Highlight on body
  ctx.fillStyle = colors.highlight;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.ellipse(45, 65, 20, 6, Math.PI * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

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

  // Eye (closed or slightly open)
  if (isBlinking) {
    // Slightly open eye
    ctx.fillStyle = colors.eye;
    ctx.beginPath();
    ctx.ellipse(80, 60.5, 1.5, 0.5, Math.PI * 0.1, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Closed eye (as a line)
    ctx.strokeStyle = colors.eye;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(78, 61);
    ctx.lineTo(82, 60);
    ctx.stroke();
  }

  // Nose
  ctx.fillStyle = colors.nose;
  ctx.beginPath();
  ctx.ellipse(84, 64, 2, 1.5, Math.PI * 0.1, 0, Math.PI * 2);
  ctx.fill();

  // Mouth (subtle curved line)
  ctx.strokeStyle = colors.mouth;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(84, 65);
  ctx.quadraticCurveTo(82, 67, 80, 66);
  ctx.stroke();

  // Front leg (tucked)
  ctx.fillStyle = colors.paw;
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 2;
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

  // Z's for sleeping (animated slightly)
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 1;
  ctx.beginPath();

  const zOffset = Math.sin(Date.now() / 1000) * 2;

  ctx.moveTo(88, 50 + zOffset);
  ctx.lineTo(93, 48 + zOffset);
  ctx.lineTo(90, 45 + zOffset);

  ctx.moveTo(93, 45 + zOffset * 0.7);
  ctx.lineTo(98, 43 + zOffset * 0.7);
  ctx.lineTo(95, 40 + zOffset * 0.7);

  ctx.stroke();
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  offset: number,
  breathingOffset: number,
  colors: typeof COLOR_PALETTES.default,
): void {
  ctx.fillStyle = colors.body;
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 2;

  // Main body with breathing animation
  ctx.beginPath();
  ctx.ellipse(50, 50 + offset, 25, 15 + breathingOffset, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Add highlight for depth
  ctx.fillStyle = colors.highlight;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.ellipse(45, 45 + offset, 15, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
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

  // Add highlight to mane for depth
  ctx.fillStyle = colors.highlight;
  ctx.globalAlpha = 0.2;
  ctx.beginPath();
  ctx.ellipse(65, 40 + offset, 10, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Add some mane detail with curved lines
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 0.5;

  // Top mane detail
  ctx.beginPath();
  ctx.moveTo(60, 30 + offset);
  ctx.quadraticCurveTo(70, 25 + offset, 80, 30 + offset);
  ctx.stroke();

  // Side mane detail
  ctx.beginPath();
  ctx.moveTo(85, 40 + offset);
  ctx.quadraticCurveTo(90, 45 + offset, 85, 55 + offset);
  ctx.stroke();
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  offset: number,
  stance: string,
  isBlinking: boolean,
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

  // Head highlight
  ctx.fillStyle = colors.highlight;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.ellipse(78, 37 + offset, 6, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Eye - with blinking
  ctx.fillStyle = colors.eye;
  if (isBlinking) {
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

    // Add eye highlight
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(84, 36 + offset, 0.8, 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Nose
  ctx.fillStyle = colors.nose;
  ctx.beginPath();
  ctx.ellipse(88, 42 + offset, 2, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Mouth - different expressions for different stances
  ctx.strokeStyle = colors.mouth;
  ctx.lineWidth = 1;
  ctx.beginPath();

  if (stance === 'running') {
    // Open mouth for running
    ctx.moveTo(88, 43 + offset);
    ctx.lineTo(85, 46 + offset);
    ctx.lineTo(88, 46 + offset);

    // Tongue for running
    ctx.fillStyle = '#ff9999';
    ctx.beginPath();
    ctx.ellipse(86.5, 46 + offset, 1.5, 1, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (stance === 'idle') {
    // Slightly curved mouth for idle
    ctx.moveTo(88, 43 + offset);
    ctx.quadraticCurveTo(86, 46 + offset, 84, 45 + offset);
  } else {
    // Normal mouth
    ctx.moveTo(88, 43 + offset);
    ctx.lineTo(85, 45 + offset);
  }
  ctx.stroke();

  // Whiskers
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 0.5;

  // Upper whiskers
  ctx.beginPath();
  ctx.moveTo(88, 41 + offset);
  ctx.lineTo(94, 40 + offset);
  ctx.moveTo(88, 42 + offset);
  ctx.lineTo(94, 43 + offset);

  // Lower whiskers
  ctx.moveTo(88, 44 + offset);
  ctx.lineTo(94, 45 + offset);
  ctx.moveTo(88, 45 + offset);
  ctx.lineTo(94, 47 + offset);

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

  // Paw details (toes)
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(65, 80 + offset);
  ctx.lineTo(65, 82 + offset);
  ctx.moveTo(68, 81 + offset);
  ctx.lineTo(68, 83 + offset);
  ctx.moveTo(71, 80 + offset);
  ctx.lineTo(71, 82 + offset);
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

  // Paw details (toes)
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(30.5, 80 - offset);
  ctx.lineTo(30.5, 82 - offset);
  ctx.moveTo(33.5, 81 - offset);
  ctx.lineTo(33.5, 83 - offset);
  ctx.moveTo(36.5, 80 - offset);
  ctx.lineTo(36.5, 82 - offset);
  ctx.stroke();
}

function drawTail(ctx: CanvasRenderingContext2D, tailAngle: number, colors: typeof COLOR_PALETTES.default): void {
  ctx.save();
  ctx.translate(25, 45);
  ctx.rotate(tailAngle);

  // Tail
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-15, 5, -25, -5, -30, -15);
  ctx.stroke();

  // Tail tip
  ctx.fillStyle = colors.tailTip;
  ctx.beginPath();
  ctx.ellipse(-30, -15, 5, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.stroke();

  // Tail details/fur
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 0.5;

  // Small fur details on tail
  ctx.beginPath();
  ctx.moveTo(-15, 2);
  ctx.lineTo(-17, 5);
  ctx.moveTo(-20, -2);
  ctx.lineTo(-22, 0);
  ctx.moveTo(-25, -8);
  ctx.lineTo(-27, -6);
  ctx.stroke();

  ctx.restore();
}

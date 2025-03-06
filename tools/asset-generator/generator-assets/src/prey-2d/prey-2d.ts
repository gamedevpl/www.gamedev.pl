import { Asset } from '../../../generator-core/src/assets-types';

// Color palettes for different variants
const colors: Record<string, string> = {
  body: '#d2b48c',
  legs: '#a89070',
  outline: '#3a2e1d',
  eye: '#2c2c2c',
  nose: '#2c2c2c',
  ear: '#c2a47c',
  tail: '#c2a47c',
};

// Pre-calculated animation values for performance
const ANIMATION_LOOKUP: Record<string, Record<string, number[]>> = {
  legOffset: {
    standing: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.2 * Math.PI * 2) * 1),
    walking: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 2 * Math.PI * 2) * 3),
    running: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 4 * Math.PI * 2) * 5),
    grazing: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.1 * Math.PI * 2) * 0.5),
    alert: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.3 * Math.PI * 2) * 0.8),
  },
  bodyOffset: {
    standing: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.5 * Math.PI * 2) * 0.5),
    walking: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 2 * Math.PI * 2) * 1),
    running: Array.from({ length: 100 }, (_, i) => Math.abs(Math.sin((i / 100) * 4 * Math.PI * 2)) * 2),
    grazing: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.3 * Math.PI * 2) * 0.3),
    alert: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.6 * Math.PI * 2) * 0.7),
  },
  headOffset: {
    standing: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.3 * Math.PI * 2) * 0.5),
    walking: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 2 * Math.PI * 2) * 0.8),
    running: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 4 * Math.PI * 2) * 1.2),
    grazing: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.1 * Math.PI * 2) * 0.3 - 3), // Lower head for grazing
    alert: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.2 * Math.PI * 2) * 0.5 - 2), // Raised head for alert
  },
  tailAngle: {
    standing: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.5 * Math.PI * 2) * 0.2),
    walking: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 2 * Math.PI * 2) * 0.5),
    running: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 4 * Math.PI * 2) * 0.8),
    grazing: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.2 * Math.PI * 2) * 0.15),
    alert: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 3 * Math.PI * 2) * 0.9), // More tail movement when alert
  },
  earAngle: {
    standing: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.2 * Math.PI * 2) * 0.1),
    walking: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.5 * Math.PI * 2) * 0.2),
    running: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 1 * Math.PI * 2) * 0.3),
    grazing: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.1 * Math.PI * 2) * 0.1),
    alert: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.8 * Math.PI * 2) * 0.4 + 0.3), // Ears more upright and active when alert
  },
};

export const Prey2d: Asset = {
  name: 'prey-2d',
  stances: ['standing', 'walking', 'running', 'grazing', 'alert'],

  description: `# Two dimensional representation of a prey animal game asset

# Projecting a prey animal in a 2D space

The prey animal is rendered from the side view in a 2D space, designed to be hunted by the lion asset.

# Style

Cartoon style, with a focus on simplicity and clarity.
Limited color palette and bold outlines.

# Animation States

- standing: Default pose with subtle movement
- walking: Moderate leg movement and body bounce
- running: Exaggerated leg movement and pronounced bounce
- grazing: Head lowered, gentle movements showing the animal eating
- alert: Head raised, ears perked up, showing awareness of danger

# Customization

- scale: Adjust the overall size of the prey
- colorVariant: Choose from default, brown, or spotted color schemes
`,
  render: (ctx: CanvasRenderingContext2D, progress: number, stance: string, direction: string): void => {
    stance = stance || 'standing';
    direction = direction || 'right';

    // Convert progress to index for lookup tables (0-99)
    const lookupIndex = Math.floor((progress % 1) * 100);

    // Get animation values from lookup tables
    const legOffset = ANIMATION_LOOKUP.legOffset[stance][lookupIndex];
    const bodyOffset = ANIMATION_LOOKUP.bodyOffset[stance][lookupIndex];
    const headOffset = ANIMATION_LOOKUP.headOffset[stance][lookupIndex];
    const tailAngle = ANIMATION_LOOKUP.tailAngle[stance][lookupIndex];
    const earAngle = ANIMATION_LOOKUP.earAngle[stance][lookupIndex];

    // Save the current context state
    ctx.save();

    // Handle direction (flip if facing left)
    if (direction === 'left') {
      ctx.scale(-1, 1);
      ctx.translate(-100, 0);
    }

    // Draw the prey animal
    drawTail(ctx, tailAngle);
    drawHindLegs(ctx, legOffset);
    drawBody(ctx, bodyOffset, false);
    drawHead(ctx, headOffset, earAngle, stance);
    drawFrontLegs(ctx, legOffset);

    // Restore the context state
    ctx.restore();
  },
};

function drawBody(
  ctx: CanvasRenderingContext2D,
  offset: number,

  spotted: boolean,
): void {
  ctx.fillStyle = colors.body;
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 2;

  // Main body - slightly smaller and more slender than the lion
  ctx.beginPath();
  ctx.ellipse(50, 50 + offset, 22, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Add spots if spotted variant
  if (spotted && 'spots' in colors) {
    ctx.fillStyle = colors.spots;

    // Draw a pattern of spots
    const spotPositions = [
      [40, 45 + offset, 3],
      [55, 48 + offset, 2.5],
      [65, 45 + offset, 2],
      [45, 55 + offset, 2.5],
      [60, 55 + offset, 3],
      [50, 50 + offset, 2],
    ];

    for (const [x, y, r] of spotPositions) {
      ctx.beginPath();
      ctx.ellipse(x, y, r, r, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawHead(ctx: CanvasRenderingContext2D, offset: number, earAngle: number, stance: string): void {
  // Head - smaller and more pointed than the lion's
  ctx.fillStyle = colors.body;
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.ellipse(75, 45 + offset, 8, 7, Math.PI * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Snout
  ctx.beginPath();
  ctx.ellipse(83, 46 + offset, 5, 3, Math.PI * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Ears
  drawEars(ctx, 70, 40 + offset, earAngle);

  // Eye - blink occasionally for standing stance
  ctx.fillStyle = colors.eye;
  if (stance === 'standing' && Math.random() > 0.95) {
    // Blinking
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(77, 43 + offset);
    ctx.lineTo(80, 43 + offset);
    ctx.stroke();
  } else {
    // Normal eye
    ctx.beginPath();
    ctx.ellipse(78, 43 + offset, 1.5, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Nose
  ctx.fillStyle = colors.nose;
  ctx.beginPath();
  ctx.ellipse(87, 46 + offset, 1.5, 1, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawEars(ctx: CanvasRenderingContext2D, x: number, y: number, earAngle: number): void {
  ctx.fillStyle = colors.ear;
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 1.5;

  // Draw both ears with the current ear angle
  for (let i = -1; i <= 1; i += 2) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(earAngle * i);

    // Ear shape
    ctx.beginPath();
    ctx.ellipse(0, -5, 2, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
}

function drawFrontLegs(ctx: CanvasRenderingContext2D, offset: number): void {
  ctx.fillStyle = colors.legs;
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 1.5;

  // Front legs - thinner than lion's
  // Left front leg
  ctx.beginPath();
  ctx.roundRect(62, 60 + offset, 4, 18, 2);
  ctx.fill();
  ctx.stroke();

  // Right front leg
  ctx.beginPath();
  ctx.roundRect(70, 60 - offset, 4, 18, 2);
  ctx.fill();
  ctx.stroke();

  // Hooves
  drawHoof(ctx, 64, 78 + offset);
  drawHoof(ctx, 72, 78 - offset);
}

function drawHindLegs(ctx: CanvasRenderingContext2D, offset: number): void {
  ctx.fillStyle = colors.legs;
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 1.5;

  // Hind legs - thinner than lion's
  // Left hind leg
  ctx.beginPath();
  ctx.roundRect(32, 60 - offset, 4, 18, 2);
  ctx.fill();
  ctx.stroke();

  // Right hind leg
  ctx.beginPath();
  ctx.roundRect(40, 60 + offset, 4, 18, 2);
  ctx.fill();
  ctx.stroke();

  // Hooves
  drawHoof(ctx, 34, 78 - offset);
  drawHoof(ctx, 42, 78 + offset);
}

function drawHoof(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.ellipse(x, y, 2, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawTail(ctx: CanvasRenderingContext2D, tailAngle: number): void {
  ctx.fillStyle = colors.tail;
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 1.5;

  ctx.save();
  ctx.translate(28, 45);
  ctx.rotate(tailAngle);

  // Short tail
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-5, 5, -8, 0, -10, -5);
  ctx.lineWidth = 3;
  ctx.stroke();

  // Tail tip
  ctx.beginPath();
  ctx.ellipse(-10, -5, 2, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

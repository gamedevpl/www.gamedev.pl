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
    walking: Array.from({ length: 100 }, (_, i) => {
      // Asymmetric leg movement for more natural gait
      return i < 50 ? Math.sin((i / 100) * 2 * Math.PI * 2) * 3 : Math.sin((i / 100) * 2 * Math.PI * 2 + Math.PI) * 3;
    }),
    running: Array.from({ length: 100 }, (_, i) => {
      // Asymmetric leg movement for more natural gait
      return i < 50 ? Math.sin((i / 100) * 4 * Math.PI * 2) * 5 : Math.sin((i / 100) * 4 * Math.PI * 2 + Math.PI) * 5;
    }),
    grazing: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.1 * Math.PI * 2) * 0.5),
    alert: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.3 * Math.PI * 2) * 0.8),
    carrion: Array.from({ length: 100 }, () => 0), // No movement for carrion
  },
  bodyOffset: {
    standing: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.5 * Math.PI * 2) * 0.5),
    walking: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 2 * Math.PI * 2) * 1),
    running: Array.from({ length: 100 }, (_, i) => Math.abs(Math.sin((i / 100) * 4 * Math.PI * 2)) * 2),
    grazing: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.3 * Math.PI * 2) * 0.3),
    alert: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.6 * Math.PI * 2) * 0.7),
    carrion: Array.from({ length: 100 }, () => 0), // No movement for carrion
  },
  headOffset: {
    standing: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.3 * Math.PI * 2) * 0.5),
    walking: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 2 * Math.PI * 2) * 0.8),
    running: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 4 * Math.PI * 2) * 1.2),
    grazing: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.1 * Math.PI * 2) * 0.3 - 3), // Lower head for grazing
    alert: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.2 * Math.PI * 2) * 0.5 - 2), // Raised head for alert
    carrion: Array.from({ length: 100 }, () => 0), // No movement for carrion
  },
  tailAngle: {
    standing: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.5 * Math.PI * 2) * 0.2),
    walking: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 2 * Math.PI * 2) * 0.5),
    running: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 4 * Math.PI * 2) * 0.8),
    grazing: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.2 * Math.PI * 2) * 0.15),
    alert: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 3 * Math.PI * 2) * 0.9), // More tail movement when alert
    carrion: Array.from({ length: 100 }, () => 0.5), // Fixed position for carrion
  },
  earAngle: {
    standing: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.2 * Math.PI * 2) * 0.1),
    walking: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.5 * Math.PI * 2) * 0.2),
    running: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 1 * Math.PI * 2) * 0.3),
    grazing: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.1 * Math.PI * 2) * 0.1),
    alert: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 0.8 * Math.PI * 2) * 0.4 + 0.3), // Ears more upright and active when alert
    carrion: Array.from({ length: 100 }, () => 0), // Fixed position for carrion
  },
  // Add leg bend for more realistic movement
  legBend: {
    standing: Array.from({ length: 100 }, () => 0),
    walking: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 2 * Math.PI * 2) * 0.1),
    running: Array.from({ length: 100 }, (_, i) => Math.sin((i / 100) * 4 * Math.PI * 2) * 0.2),
    grazing: Array.from({ length: 100 }, () => 0.05), // Slight bend when grazing
    alert: Array.from({ length: 100 }, () => 0),
    carrion: Array.from({ length: 100 }, () => 0), // No bend for carrion
  },
};

export const Prey2d: Asset = {
  name: 'prey-2d',
  stances: ['standing', 'walking', 'running', 'grazing', 'alert', 'carrion', 'drinking', 'eating'],

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
- carrion: Lying down, not moving, representing a dead animal
- drinking: Head lowered, drinking water
- eating: Head lowered, eating food
`,
  render: (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    progress: number,
    stance: string,
    direction: string,
  ): void => {
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
    const legBend = ANIMATION_LOOKUP.legBend[stance][lookupIndex];

    // Save the current context state
    ctx.save();

    // Apply transformations for positioning and scaling
    ctx.translate(x, y);
    ctx.scale(width / 100, height / 100);

    // Handle direction (flip if facing left)
    if (direction === 'left') {
      ctx.scale(-1, 1);
      ctx.translate(-100, 0);
    }

    // Special case for carrion stance
    if (stance === 'carrion') {
      drawCarrion(ctx);
    } else {
      // Draw the prey animal in other stances
      drawTail(ctx, tailAngle);
      drawHindLegs(ctx, legOffset, legBend, stance);
      drawBody(ctx, bodyOffset, false);
      drawHead(ctx, headOffset, earAngle, stance);
      drawFrontLegs(ctx, legOffset, legBend, stance);
    }

    // Restore the context state
    ctx.restore();
  },
};

function drawBody(ctx: CanvasRenderingContext2D, offset: number, spotted: boolean): void {
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

function drawFrontLegs(ctx: CanvasRenderingContext2D, offset: number, bend: number, stance: string): void {
  ctx.fillStyle = colors.legs;
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 1.5;

  const legLength = 18;
  const legWidth = 4;

  // Base positions for leg attachment to body
  const leftLegX = 62;
  const rightLegX = 70;
  const legY = 60;

  // Apply different offsets to each leg for more natural movement
  const leftOffset = offset;
  const rightOffset = stance === 'walking' || stance === 'running' ? -offset : offset;

  // Draw front legs with articulation
  drawArticulatedLeg(ctx, leftLegX, legY + leftOffset, legWidth, legLength, bend, true);
  drawArticulatedLeg(ctx, rightLegX, legY + rightOffset, legWidth, legLength, bend, false);
}

function drawHindLegs(ctx: CanvasRenderingContext2D, offset: number, bend: number, stance: string): void {
  ctx.fillStyle = colors.legs;
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 1.5;

  const legLength = 18;
  const legWidth = 4;

  // Base positions for leg attachment to body
  const leftLegX = 32;
  const rightLegX = 40;
  const legY = 60;

  // Apply different offsets to each leg for more natural movement
  const leftOffset = stance === 'walking' || stance === 'running' ? -offset : offset;
  const rightOffset = offset;

  // Draw hind legs with articulation
  drawArticulatedLeg(ctx, leftLegX, legY + leftOffset, legWidth, legLength, bend, false);
  drawArticulatedLeg(ctx, rightLegX, legY + rightOffset, legWidth, legLength, bend, true);
}

function drawArticulatedLeg(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  length: number,
  bend: number,
  isForward: boolean,
): void {
  // Upper part of leg
  const upperLength = length * 0.5;
  const lowerLength = length * 0.5;

  // Calculate joint position with bend
  const jointX = x + (isForward ? (width / 2) * bend : (-width / 2) * bend);
  const jointY = y + upperLength;

  // Draw upper leg segment
  ctx.beginPath();
  ctx.roundRect(x, y, width, upperLength, 2);
  ctx.fill();
  ctx.stroke();

  // Draw lower leg segment with bend
  ctx.save();
  ctx.translate(jointX, jointY);
  ctx.rotate(isForward ? bend * 0.2 : -bend * 0.2);
  ctx.beginPath();
  ctx.roundRect(-width / 2, 0, width, lowerLength, 2);
  ctx.fill();
  ctx.stroke();

  // Draw hoof at the end of lower leg
  drawHoof(ctx, 0, lowerLength);
  ctx.restore();
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

function drawCarrion(ctx: CanvasRenderingContext2D): void {
  // Draw the prey animal in a lying down position (carrion)
  ctx.fillStyle = colors.body;
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 2;

  // Rotated body
  ctx.save();
  ctx.translate(50, 65);
  ctx.rotate(Math.PI * 0.5); // Rotate 90 degrees to lie on side

  // Main body
  ctx.beginPath();
  ctx.ellipse(0, 0, 12, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Head - lying to the side
  ctx.save();
  ctx.translate(70, 70);
  ctx.rotate(Math.PI * 0.3); // Head tilted

  // Head shape
  ctx.beginPath();
  ctx.ellipse(0, 0, 7, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Snout
  ctx.beginPath();
  ctx.ellipse(8, 1, 3, 5, Math.PI * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Closed eye - X shape
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-2, -2);
  ctx.lineTo(2, 2);
  ctx.moveTo(2, -2);
  ctx.lineTo(-2, 2);
  ctx.stroke();

  ctx.restore();

  // Legs sprawled out
  ctx.fillStyle = colors.legs;

  // Front legs
  ctx.beginPath();
  ctx.roundRect(60, 70, 18, 4, 2);
  ctx.fill();
  ctx.stroke();

  // Hind legs
  ctx.beginPath();
  ctx.roundRect(35, 70, 18, 4, 2);
  ctx.fill();
  ctx.stroke();

  // Tail
  ctx.save();
  ctx.translate(28, 65);
  ctx.rotate(Math.PI * 0.7); // Tail lying limp

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

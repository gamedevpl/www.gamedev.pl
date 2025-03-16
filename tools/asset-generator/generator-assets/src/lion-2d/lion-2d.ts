import { Asset } from '../../../generator-core/src/assets-types';

// Enhanced color palette with semantic naming
const colors = {
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
  tongue: '#ff9999',
  roarEffect: 'rgba(255, 180, 0, 0.3)', // For roaring stance
  food: '#8B4513', // For eating stance
  teeth: '#ffffff', // For roaring stance
  innerMouth: '#a02c2c', // For roaring stance
}; // Animation configuration by stance
type AnimationConfig = {
  legAmplitude: number;
  legFrequency: number;
  bodyAmplitude: number;
  bodyFrequency: number;
  tailAmplitude: number;
  tailFrequency: number;
  blinkRate: number;
  breathingAmplitude: number;
  breathingFrequency: number;
  headBobAmplitude?: number;
  headBobFrequency?: number;
  mouthOpenAmount?: number; // For roaring and eating stances
  earTwitchAmplitude?: number; // For ambushing stance
  earTwitchFrequency?: number; // For ambushing stance
  crouchAmount?: number; // For ambushing stance
  chewingAmplitude?: number; // For eating stance
  chewingFrequency?: number; // For eating stance
};

const ANIMATION_CONFIG: Record<string, AnimationConfig> = {
  standing: {
    legAmplitude: 1,
    legFrequency: 0.2,
    bodyAmplitude: 0.5,
    bodyFrequency: 0.5,
    tailAmplitude: 1.5, // Increased for more visible tail movement
    tailFrequency: 0.5,
    blinkRate: 0.02,
    breathingAmplitude: 0.5,
    breathingFrequency: 0.3,
    headBobAmplitude: 0.5, // Added subtle head bob
    headBobFrequency: 0.4,
  },
  walking: {
    legAmplitude: 3,
    legFrequency: 2,
    bodyAmplitude: 1,
    bodyFrequency: 2,
    tailAmplitude: 1.2, // Increased for more dynamic tail movement
    tailFrequency: 2,
    blinkRate: 0.01,
    breathingAmplitude: 0.3,
    breathingFrequency: 0.5,
    headBobAmplitude: 1.5,
    headBobFrequency: 2,
  },
  running: {
    legAmplitude: 5,
    legFrequency: 4,
    bodyAmplitude: 2,
    bodyFrequency: 4,
    tailAmplitude: 1.8, // Increased for more dynamic tail movement
    tailFrequency: 3,
    blinkRate: 0.005,
    breathingAmplitude: 0.8,
    breathingFrequency: 1,
    headBobAmplitude: 2.5,
    headBobFrequency: 4,
  },
  idle: {
    legAmplitude: 0.5,
    legFrequency: 0.1,
    bodyAmplitude: 0.3,
    bodyFrequency: 0.3,
    tailAmplitude: 0.8, // Enhanced tail movement for idle
    tailFrequency: 0.2,
    blinkRate: 0.1,
    breathingAmplitude: 0.4,
    breathingFrequency: 0.2,
    headBobAmplitude: 0.3, // Added subtle head bob
    headBobFrequency: 0.15,
  },
  sleeping: {
    legAmplitude: 0,
    legFrequency: 0,
    bodyAmplitude: 0.2,
    bodyFrequency: 0.05,
    tailAmplitude: 0.05,
    tailFrequency: 0.1,
    blinkRate: 1, // Eyes remain closed
    breathingAmplitude: 1,
    breathingFrequency: 0.1,
  },
  ambushing: {
    legAmplitude: 0.3,
    legFrequency: 0.05,
    bodyAmplitude: 0.2,
    bodyFrequency: 0.1,
    tailAmplitude: 1.0,
    tailFrequency: 0.4,
    blinkRate: 0.001, // Rarely blinks while focused
    breathingAmplitude: 0.2, // Shallow breathing
    breathingFrequency: 0.3,
    earTwitchAmplitude: 0.5, // Ear twitching
    earTwitchFrequency: 0.1,
    crouchAmount: 0.7, // How low the lion crouches
  },
  roaring: {
    legAmplitude: 0.5,
    legFrequency: 0.1,
    bodyAmplitude: 1.0,
    bodyFrequency: 0.5,
    tailAmplitude: 1.5,
    tailFrequency: 0.6,
    blinkRate: 0.005, // Eyes wide open while roaring
    breathingAmplitude: 1.2, // Deep breathing
    breathingFrequency: 0.8,
    headBobAmplitude: 1.0, // Head movement during roar
    headBobFrequency: 0.5,
    mouthOpenAmount: 0.9, // Mouth wide open for roaring
  },
  eating: {
    legAmplitude: 0.2,
    legFrequency: 0.05,
    bodyAmplitude: 0.5,
    bodyFrequency: 0.2,
    tailAmplitude: 0.6,
    tailFrequency: 0.3,
    blinkRate: 0.05,
    breathingAmplitude: 0.3,
    breathingFrequency: 0.4,
    headBobAmplitude: 0.8, // Head bobbing while eating
    headBobFrequency: 1.2,
    mouthOpenAmount: 0.4, // Mouth partially open
    chewingAmplitude: 0.6, // Chewing motion
    chewingFrequency: 1.5,
  },
}; // Helper for calculating animation values on demand
function calculateAnimationValue(progress: number, amplitude: number, frequency: number, phaseShift = 0): number {
  return Math.sin(progress * Math.PI * 2 * frequency + phaseShift) * amplitude;
}

// Drawing helper functions
function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: 'ellipse' | 'roundRect',
  params: number[],
  fillStyle?: string,
  strokeStyle?: string,
  lineWidth = 2,
): void {
  if (fillStyle) ctx.fillStyle = fillStyle;
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
  }

  ctx.beginPath();

  if (shape === 'ellipse') {
    // params: [x, y, radiusX, radiusY, rotation, startAngle, endAngle]
    ctx.ellipse(params[0], params[1], params[2], params[3], params[4] || 0, params[5] || 0, params[6] || Math.PI * 2);
  } else if (shape === 'roundRect') {
    // params: [x, y, width, height, radius]
    ctx.roundRect(params[0], params[1], params[2], params[3], params[4] || 0);
  }

  if (fillStyle) ctx.fill();
  if (strokeStyle) ctx.stroke();
}

function drawShadow(ctx: CanvasRenderingContext2D, stance: string, bodyOffset: number): void {
  if (stance === 'sleeping') {
    // Oval shadow beneath sleeping lion
    drawShape(ctx, 'ellipse', [50, 82, 35, 5], colors.shadow);
  } else if (stance === 'ambushing') {
    // Wider, flatter shadow for crouching lion
    drawShape(ctx, 'ellipse', [50, 82, 30, 3.5], colors.shadow);
  } else {
    // Dynamic shadow that moves with the lion
    drawShape(ctx, 'ellipse', [50, 82, 25 + Math.abs(bodyOffset), 4], colors.shadow);
  }
}
function drawSleepingLion(ctx: CanvasRenderingContext2D, breathingOffset: number, progress: number): void {
  // Body (lying down) with enhanced breathing animation
  const breathingScale = 0.5 + 0.5 * Math.sin(progress * Math.PI * 2 * 0.1); // Smooth breathing cycle

  // Properly shaped lion body (more elongated, less round)
  drawShape(ctx, 'ellipse', [50, 70, 30, 12 + breathingOffset * breathingScale], colors.body, colors.outline);

  // Highlight on body
  ctx.globalAlpha = 0.3;
  drawShape(ctx, 'ellipse', [45, 65, 20, 6], colors.highlight);
  ctx.globalAlpha = 1;

  // Head (resting, properly shaped like a lion)
  drawShape(ctx, 'ellipse', [75, 65, 12, 10, Math.PI * 0.1], colors.body, colors.outline);

  // Mane (appropriate for a lion, surrounding the head)
  drawShape(ctx, 'ellipse', [70, 63, 18, 15, Math.PI * 0.1], colors.mane, colors.outline);

  // Add mane texture details
  ctx.strokeStyle = colors.darkMane;
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 8; i++) {
    const angle = Math.PI * 0.1 + (i * Math.PI) / 4;
    const x = 70 + 16 * Math.cos(angle);
    const y = 63 + 13 * Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(70, 63);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  // Darker inner mane
  drawShape(ctx, 'ellipse', [72, 63, 10, 9, Math.PI * 0.1], colors.darkMane);

  // Eyes (closed while sleeping)
  ctx.strokeStyle = colors.eye;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(78, 61);
  ctx.lineTo(82, 60);
  ctx.stroke();

  // Nose
  drawShape(ctx, 'ellipse', [84, 64, 2, 1.5, Math.PI * 0.1], colors.nose);

  // Mouth (subtle curved line)
  ctx.strokeStyle = colors.mouth;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(84, 65);
  ctx.quadraticCurveTo(82, 67, 80, 66);
  ctx.stroke();

  // Front legs (tucked under, properly shaped for lion)
  drawShape(ctx, 'roundRect', [60, 75, 6, 5, 2], colors.paw, colors.outline);
  drawShape(ctx, 'ellipse', [65, 78, 8, 4], colors.paw, colors.outline);

  // Hind legs (tucked under, properly shaped for lion)
  drawShape(ctx, 'roundRect', [30, 75, 6, 5, 2], colors.paw, colors.outline);
  drawShape(ctx, 'ellipse', [35, 78, 8, 4], colors.paw, colors.outline);

  // Tail (curled, lion-like)
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(20, 70);
  ctx.bezierCurveTo(15, 60, 10, 60, 15, 70);
  ctx.stroke();

  // Tail tip
  drawShape(ctx, 'ellipse', [15, 70, 4, 3], colors.tailTip, colors.outline, 2);

  // Add fur texture to tail tip
  ctx.strokeStyle = colors.darkMane;
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 5; i++) {
    const angle = Math.PI / 2 + (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(15, 70);
    ctx.lineTo(15 + 3 * Math.cos(angle), 70 + 2 * Math.sin(angle));
    ctx.stroke();
  }

  // Z's for sleeping (animated slightly)
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 1;
  ctx.beginPath();

  const zOffset = Math.sin(progress * Math.PI * 2) * 2;

  ctx.moveTo(88, 50 + zOffset);
  ctx.lineTo(93, 48 + zOffset);
  ctx.lineTo(90, 45 + zOffset);

  ctx.moveTo(93, 45 + zOffset * 0.7);
  ctx.lineTo(98, 43 + zOffset * 0.7);
  ctx.lineTo(95, 40 + zOffset * 0.7);

  ctx.stroke();
}
function drawAmbushingLion(
  ctx: CanvasRenderingContext2D,
  config: AnimationConfig,
  progress: number,
  _bodyOffset: number,
  _legOffset: number,
  tailAngle: number,
  breathingOffset: number,
  isBlinking: boolean,
  headBobOffset: number,
): void {
  // Calculate ear twitching if config has those properties
  const earTwitch =
    config.earTwitchAmplitude && config.earTwitchFrequency
      ? calculateAnimationValue(progress, config.earTwitchAmplitude, config.earTwitchFrequency)
      : 0;

  // Crouch amount (lower to the ground)
  const crouchAmount = config.crouchAmount || 0.5;

  // Draw tail with more tension
  ctx.save();
  ctx.translate(25, 45 + crouchAmount * 10); // Lower tail position when crouching
  ctx.rotate(tailAngle * 0.5); // More subtle tail movement when ambushing

  // Tail held low and tense
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-15, 0, -25, -5, -30, -5); // More horizontal tail
  ctx.stroke();

  // Tail tip with tension
  drawShape(ctx, 'ellipse', [-30, -5, 5, 3], colors.tailTip, colors.outline, 2);

  ctx.restore();

  // Legs in crouching position
  // Hind leg bent and ready to pounce
  drawShape(ctx, 'roundRect', [30, 65 + crouchAmount * 10, 8, 15 - crouchAmount * 5, 3], colors.paw, colors.outline);
  drawShape(ctx, 'ellipse', [34, 80, 6, 3], colors.paw, colors.outline);

  // Body lower to ground
  drawShape(ctx, 'ellipse', [50, 55 + crouchAmount * 10, 25, 15 + breathingOffset], colors.body, colors.outline);

  // Highlight on body
  ctx.globalAlpha = 0.3;
  drawShape(ctx, 'ellipse', [45, 50 + crouchAmount * 10, 15, 8], colors.highlight);
  ctx.globalAlpha = 1;

  // Mane slightly ruffled
  drawShape(ctx, 'ellipse', [70, 50 + crouchAmount * 10, 18, 20], colors.mane, colors.outline);
  drawShape(ctx, 'ellipse', [72, 50 + crouchAmount * 10, 12, 15], colors.darkMane);

  // Head lower, focused forward
  drawShape(ctx, 'ellipse', [80, 45 + crouchAmount * 10 + headBobOffset, 10, 10], colors.body, colors.outline);

  // Eyes - focused, intense
  if (!isBlinking) {
    drawShape(ctx, 'ellipse', [85, 42 + crouchAmount * 10 + headBobOffset, 2.5, 2], colors.eye);
    // Intense focus - pupil
    drawShape(ctx, 'ellipse', [86, 42 + crouchAmount * 10 + headBobOffset, 1, 1], '#000000');
  } else {
    // Quick blink
    ctx.strokeStyle = colors.eye;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(83, 42 + crouchAmount * 10 + headBobOffset);
    ctx.lineTo(87, 42 + crouchAmount * 10 + headBobOffset);
    ctx.stroke();
  }

  // Ears alert and twitching
  ctx.save();
  ctx.translate(75, 38 + crouchAmount * 10 + headBobOffset);
  ctx.rotate(earTwitch * 0.1);
  drawShape(ctx, 'ellipse', [0, 0, 3, 5, Math.PI * 0.25], colors.body, colors.outline);
  ctx.restore();

  ctx.save();
  ctx.translate(80, 36 + crouchAmount * 10 + headBobOffset);
  ctx.rotate(-earTwitch * 0.1);
  drawShape(ctx, 'ellipse', [0, 0, 3, 5, -Math.PI * 0.25], colors.body, colors.outline);
  ctx.restore();

  // Nose
  drawShape(ctx, 'ellipse', [88, 47 + crouchAmount * 10 + headBobOffset, 2, 1.5], colors.nose);

  // Mouth - slightly open, ready
  ctx.strokeStyle = colors.mouth;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(88, 48 + crouchAmount * 10 + headBobOffset);
  ctx.lineTo(85, 50 + crouchAmount * 10 + headBobOffset);
  ctx.stroke();

  // Front leg bent and ready
  drawShape(ctx, 'roundRect', [65, 65 + crouchAmount * 10, 6, 15 - crouchAmount * 5, 3], colors.paw, colors.outline);
  drawShape(ctx, 'ellipse', [68, 80, 5, 3], colors.paw, colors.outline);
}
function drawRoaringLion(
  ctx: CanvasRenderingContext2D,
  config: AnimationConfig,
  progress: number,
  bodyOffset: number,
  legOffset: number,
  tailAngle: number,
  breathingOffset: number,
  headBobOffset: number,
): void {
  // Draw tail with more tension and energy
  ctx.save();
  ctx.translate(25, 45);
  ctx.rotate(tailAngle * 1.2); // More energetic tail movement when roaring

  // Tail with more dynamic movement
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-15, 5, -25, -5, -30, -15);
  ctx.stroke();

  // Tail tip
  drawShape(ctx, 'ellipse', [-30, -15, 5, 4], colors.tailTip, colors.outline, 2);

  ctx.restore();

  // Legs in strong stance
  // Hind leg
  drawShape(ctx, 'roundRect', [30, 60 - legOffset * 0.5, 7, 20, 3], colors.paw, colors.outline);
  drawShape(ctx, 'ellipse', [33.5, 80 - legOffset * 0.5, 5, 3], colors.paw, colors.outline);

  // Body with more tension
  drawShape(ctx, 'ellipse', [50, 50 + bodyOffset, 25, 15 + breathingOffset * 1.5], colors.body, colors.outline);

  // Highlight on body
  ctx.globalAlpha = 0.3;
  drawShape(ctx, 'ellipse', [45, 45 + bodyOffset, 15, 8], colors.highlight);
  ctx.globalAlpha = 1;

  // Mane fully extended and ruffled (larger during roar)
  drawShape(ctx, 'ellipse', [70, 45 + bodyOffset, 20, 22], colors.mane, colors.outline);

  // Add mane texture with more volume
  ctx.strokeStyle = colors.darkMane;
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI * 2) / 12;
    const length = 4 + Math.random() * 3;
    const x1 = 70 + 20 * Math.cos(angle);
    const y1 = 45 + bodyOffset + 22 * Math.sin(angle);
    const x2 = x1 + length * Math.cos(angle);
    const y2 = y1 + length * Math.sin(angle);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Darker inner mane
  drawShape(ctx, 'ellipse', [72, 45 + bodyOffset, 14, 17], colors.darkMane);

  // Head with roaring position
  drawShape(ctx, 'ellipse', [80, 40 + bodyOffset + headBobOffset, 10, 10], colors.body, colors.outline);

  // Eyes - wide open during roar
  drawShape(ctx, 'ellipse', [85, 37 + bodyOffset + headBobOffset, 2.5, 3], colors.eye);

  // Mouth wide open for roaring
  const mouthOpenAmount = config.mouthOpenAmount || 0.7;

  // Draw open mouth
  ctx.fillStyle = colors.innerMouth;
  ctx.beginPath();
  ctx.moveTo(88, 43 + bodyOffset + headBobOffset);
  ctx.lineTo(95, 45 + bodyOffset + headBobOffset);
  ctx.lineTo(95, 45 + bodyOffset + headBobOffset + 8 * mouthOpenAmount);
  ctx.lineTo(88, 48 + bodyOffset + headBobOffset + 5 * mouthOpenAmount);
  ctx.closePath();
  ctx.fill();

  // Mouth outline
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Teeth
  ctx.fillStyle = colors.teeth;
  // Upper teeth
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(89 + i * 2, 45 + bodyOffset + headBobOffset);
    ctx.lineTo(90 + i * 2, 45 + bodyOffset + headBobOffset);
    ctx.lineTo(89.5 + i * 2, 47 + bodyOffset + headBobOffset);
    ctx.closePath();
    ctx.fill();
  }

  // Lower teeth (canines)
  ctx.beginPath();
  ctx.moveTo(89, 47 + bodyOffset + headBobOffset + 3 * mouthOpenAmount);
  ctx.lineTo(90, 47 + bodyOffset + headBobOffset + 3 * mouthOpenAmount);
  ctx.lineTo(89.5, 44 + bodyOffset + headBobOffset + 3 * mouthOpenAmount);
  ctx.closePath();
  ctx.fill();

  // Roar effect (sound waves)
  ctx.globalAlpha = 0.2 + 0.1 * Math.sin(progress * Math.PI * 10);
  for (let i = 0; i < 3; i++) {
    const radius = 5 + i * 4 + 2 * Math.sin(progress * Math.PI * 5 + i);
    drawShape(
      ctx,
      'ellipse',
      [95, 45 + bodyOffset + headBobOffset + 4 * mouthOpenAmount, radius, radius * 0.7],
      colors.roarEffect,
    );
  }
  ctx.globalAlpha = 1;

  // Nose
  drawShape(ctx, 'ellipse', [88, 42 + bodyOffset + headBobOffset, 2, 1.5], colors.nose);

  // Front leg
  drawShape(ctx, 'roundRect', [65, 60 + legOffset * 0.5, 6, 20, 3], colors.paw, colors.outline);
  drawShape(ctx, 'ellipse', [68, 80 + legOffset * 0.5, 5, 3], colors.paw, colors.outline);
}
function drawEatingLion(
  ctx: CanvasRenderingContext2D,
  config: AnimationConfig,
  progress: number,
  bodyOffset: number,
  legOffset: number,
  tailAngle: number,
  breathingOffset: number,
  isBlinking: boolean,
  headBobOffset: number,
): void {
  // Calculate chewing animation
  const chewingMotion =
    config.chewingAmplitude && config.chewingFrequency
      ? calculateAnimationValue(progress, config.chewingAmplitude, config.chewingFrequency)
      : 0;

  // Draw tail with gentle movement
  drawTail(ctx, tailAngle * 0.5); // More subtle tail movement when eating

  // Legs in relaxed stance
  drawHindLeg(ctx, legOffset * 0.3); // Reduced leg movement when eating

  // Body
  drawShape(ctx, 'ellipse', [50, 50 + bodyOffset * 0.7, 25, 15 + breathingOffset], colors.body, colors.outline);

  // Highlight on body
  ctx.globalAlpha = 0.3;
  drawShape(ctx, 'ellipse', [45, 45 + bodyOffset * 0.7, 15, 8], colors.highlight);
  ctx.globalAlpha = 1;

  // Mane
  drawMane(ctx, bodyOffset * 0.7, 'idle'); // Use idle mane style

  // Head with eating position (lowered)
  drawShape(ctx, 'ellipse', [80, 55 + headBobOffset, 10, 10], colors.body, colors.outline);

  // Eyes - occasionally blinking
  if (!isBlinking) {
    drawShape(ctx, 'ellipse', [85, 52 + headBobOffset, 2, 2], colors.eye);
  } else {
    // Blinking
    ctx.strokeStyle = colors.eye;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(83, 52 + headBobOffset);
    ctx.lineTo(87, 52 + headBobOffset);
    ctx.stroke();
  }

  // Nose
  drawShape(ctx, 'ellipse', [88, 57 + headBobOffset, 2, 1.5], colors.nose);

  // Mouth chewing - using mouthOpenAmount from config
  const mouthOpenAmount = (config.mouthOpenAmount || 0.3) * (0.5 + 0.5 * Math.abs(chewingMotion));

  // Draw mouth with appropriate opening based on chewing motion
  ctx.strokeStyle = colors.mouth;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(88, 58 + headBobOffset);
  ctx.lineTo(85, 60 + headBobOffset + mouthOpenAmount * 3);
  ctx.stroke();

  // Food item
  ctx.fillStyle = colors.food;
  ctx.beginPath();
  ctx.ellipse(90, 63 + headBobOffset, 6, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Blood/juice from food
  ctx.fillStyle = 'rgba(160, 44, 44, 0.7)';
  ctx.beginPath();
  ctx.moveTo(85, 63 + headBobOffset);
  ctx.lineTo(87, 65 + headBobOffset);
  ctx.lineTo(86, 67 + headBobOffset);
  ctx.closePath();
  ctx.fill();

  // Front leg
  drawFrontLeg(ctx, legOffset * 0.3); // Reduced leg movement when eating
}

function drawBody(ctx: CanvasRenderingContext2D, offset: number, breathingOffset: number): void {
  // Main body with breathing animation
  drawShape(ctx, 'ellipse', [50, 50 + offset, 25, 15 + breathingOffset], colors.body, colors.outline);

  // Add highlight for depth
  ctx.globalAlpha = 0.3;
  drawShape(ctx, 'ellipse', [45, 45 + offset, 15, 8], colors.highlight);
  ctx.globalAlpha = 1;
}

function drawMane(ctx: CanvasRenderingContext2D, offset: number, stance: string): void {
  // Main mane
  drawShape(ctx, 'ellipse', [70, 45 + offset, 18, 20], colors.mane, colors.outline);

  // Enhanced mane details - add more texture and volume
  const maneDetails = stance === 'running' ? 12 : 8; // More detail when running

  // Add fur-like strokes around the mane
  ctx.strokeStyle = colors.darkMane;
  ctx.lineWidth = 0.8;

  for (let i = 0; i < maneDetails; i++) {
    const angle = (i * Math.PI * 2) / maneDetails;
    const length = 3 + Math.random() * 3; // Varied length for natural look
    const x1 = 70 + 18 * Math.cos(angle);
    const y1 = 45 + offset + 20 * Math.sin(angle);
    const x2 = x1 + length * Math.cos(angle);
    const y2 = y1 + length * Math.sin(angle);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Darker inner mane details
  drawShape(ctx, 'ellipse', [72, 45 + offset, 12, 15], colors.darkMane);

  // Add highlight to mane for depth
  ctx.globalAlpha = 0.2;
  drawShape(ctx, 'ellipse', [65, 40 + offset, 10, 12], colors.highlight);
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
function drawHead(ctx: CanvasRenderingContext2D, offset: number, stance: string, isBlinking: boolean): void {
  // Head
  drawShape(ctx, 'ellipse', [80, 40 + offset, 10, 10], colors.body, colors.outline);

  // Head highlight
  ctx.globalAlpha = 0.3;
  drawShape(ctx, 'ellipse', [78, 37 + offset, 6, 5], colors.highlight);
  ctx.globalAlpha = 1;

  // Enhanced facial expressions based on stance
  if (stance === 'running') {
    // Alert, excited expression
    drawRunningFacialExpression(ctx, offset);
  } else if (stance === 'idle') {
    // More animated idle expression - subtle movements
    drawIdleFacialExpression(ctx, offset, isBlinking);
  } else {
    // Default expression
    drawDefaultFacialExpression(ctx, offset, isBlinking);
  }

  // Whiskers
  drawWhiskers(ctx, offset);
}

function drawDefaultFacialExpression(ctx: CanvasRenderingContext2D, offset: number, isBlinking: boolean): void {
  // Eye - with blinking
  if (isBlinking) {
    // Blinking
    ctx.strokeStyle = colors.eye;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(83, 37 + offset);
    ctx.lineTo(87, 37 + offset);
    ctx.stroke();
  } else {
    // Normal eye
    drawShape(ctx, 'ellipse', [85, 37 + offset, 2, 2], colors.eye);

    // Add eye highlight
    drawShape(ctx, 'ellipse', [84, 36 + offset, 0.8, 0.8], '#ffffff');
  }

  // Nose
  drawShape(ctx, 'ellipse', [88, 42 + offset, 2, 1.5], colors.nose);

  // Normal mouth
  ctx.strokeStyle = colors.mouth;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(88, 43 + offset);
  ctx.lineTo(85, 45 + offset);
  ctx.stroke();
}

function drawRunningFacialExpression(ctx: CanvasRenderingContext2D, offset: number): void {
  // Alert eyes
  drawShape(ctx, 'ellipse', [85, 37 + offset, 2.5, 2.5], colors.eye);
  drawShape(ctx, 'ellipse', [84, 36 + offset, 0.8, 0.8], '#ffffff');

  // Nose
  drawShape(ctx, 'ellipse', [88, 42 + offset, 2, 1.5], colors.nose);

  // Open mouth for running
  ctx.strokeStyle = colors.mouth;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(88, 43 + offset);
  ctx.lineTo(85, 46 + offset);
  ctx.lineTo(88, 46 + offset);
  ctx.stroke();

  // Tongue for running
  drawShape(ctx, 'ellipse', [86.5, 46 + offset, 1.5, 1], colors.tongue);
}

function drawIdleFacialExpression(ctx: CanvasRenderingContext2D, offset: number, isBlinking: boolean): void {
  // Relaxed eyes, slightly squinted
  if (isBlinking) {
    ctx.strokeStyle = colors.eye;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(83, 37 + offset);
    ctx.lineTo(87, 37 + offset);
    ctx.stroke();
  } else {
    // Slightly squinted eyes
    ctx.fillStyle = colors.eye;
    ctx.beginPath();
    ctx.ellipse(85, 37 + offset, 2, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Add eye highlight
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(84, 36.5 + offset, 0.8, 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Nose
  drawShape(ctx, 'ellipse', [88, 42 + offset, 2, 1.5], colors.nose);

  // More animated mouth for idle - occasional small movements
  ctx.strokeStyle = colors.mouth;
  ctx.lineWidth = 1;
  ctx.beginPath();

  // Small random variation to make idle more lively
  const mouthCurve = Math.sin(Date.now() / 2000) * 0.5;

  ctx.moveTo(88, 43 + offset);
  ctx.quadraticCurveTo(86, 46 + offset + mouthCurve, 84, 45 + offset);
  ctx.stroke();
}
function drawWhiskers(ctx: CanvasRenderingContext2D, offset: number): void {
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

function drawFrontLeg(ctx: CanvasRenderingContext2D, offset: number): void {
  // Front leg with improved connection to body
  drawShape(ctx, 'roundRect', [65, 60 + offset, 6, 20, 3], colors.paw, colors.outline);

  // Paw
  drawShape(ctx, 'ellipse', [68, 80 + offset, 5, 3], colors.paw, colors.outline);

  // Paw details (toes)
  drawPawDetails(ctx, 65, 68, 71, 80 + offset);
}

function drawHindLeg(ctx: CanvasRenderingContext2D, offset: number): void {
  // Hind leg with improved connection to body
  drawShape(ctx, 'roundRect', [30, 60 - offset, 7, 20, 3], colors.paw, colors.outline);

  // Paw
  drawShape(ctx, 'ellipse', [33.5, 80 - offset, 5, 3], colors.paw, colors.outline);

  // Paw details (toes)
  drawPawDetails(ctx, 30.5, 33.5, 36.5, 80 - offset);
}

function drawPawDetails(ctx: CanvasRenderingContext2D, x1: number, x2: number, x3: number, y: number): void {
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x1, y + 2);
  ctx.moveTo(x2, y + 1);
  ctx.lineTo(x2, y + 3);
  ctx.moveTo(x3, y);
  ctx.lineTo(x3, y + 2);
  ctx.stroke();
}

function drawTail(ctx: CanvasRenderingContext2D, tailAngle: number): void {
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

  // Tail tip with enhanced detail
  drawShape(ctx, 'ellipse', [-30, -15, 5, 4], colors.tailTip, colors.outline, 2);

  // Add fur texture to tail tip
  ctx.strokeStyle = colors.darkMane;
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 6; i++) {
    const angle = -Math.PI / 4 + (i * Math.PI) / 6;
    ctx.beginPath();
    ctx.moveTo(-30, -15);
    ctx.lineTo(-30 + 5 * Math.cos(angle), -15 + 4 * Math.sin(angle));
    ctx.stroke();
  }

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

export const Lion2d: Asset = {
  name: 'lion-2d',
  stances: ['standing', 'walking', 'running', 'idle', 'sleeping', 'ambushing', 'roaring', 'eating'],
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
- ambushing: Lion in a crouching pose ready to pounce
- roaring: Lion in a roaring pose with mouth open
- eating: Lion in a eating pose, chewing on something
`,
  render(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    progress: number,
    stance: string,
    direction: 'left' | 'right',
  ): void {
    // Ensure we have valid stance and direction
    const validStance = this.stances.includes(stance) ? stance : 'standing';
    const validDirection = direction || 'right';

    // Get animation config for current stance
    const config = ANIMATION_CONFIG[validStance] || ANIMATION_CONFIG.standing;

    // Calculate animation values
    const legOffset = calculateAnimationValue(progress, config.legAmplitude, config.legFrequency);
    const bodyOffset = calculateAnimationValue(progress, config.bodyAmplitude, config.bodyFrequency);
    const tailAngle = calculateAnimationValue(progress, config.tailAmplitude, config.tailFrequency);
    const breathingOffset = calculateAnimationValue(progress, config.breathingAmplitude, config.breathingFrequency);
    const isBlinking = Math.random() < config.blinkRate;

    // Calculate head bob for appropriate stances
    const headBobOffset =
      config.headBobAmplitude && config.headBobFrequency
        ? calculateAnimationValue(progress, config.headBobAmplitude, config.headBobFrequency, Math.PI / 2) // Phase shift for natural movement
        : 0;

    // Save the current context state
    ctx.save();

    // Apply transformations for positioning and scaling
    ctx.translate(x, y);
    ctx.scale(width / 100, height / 100);

    // Handle direction (flip if facing left)
    if (validDirection === 'left') {
      ctx.scale(-1, 1);
      ctx.translate(-100, 0);
    }

    // Draw shadow first (under everything)
    drawShadow(ctx, validStance, bodyOffset);

    // Handle each stance with appropriate rendering
    if (validStance === 'sleeping') {
      drawSleepingLion(ctx, breathingOffset, progress);
    } else if (validStance === 'ambushing') {
      drawAmbushingLion(
        ctx,
        config,
        progress,
        bodyOffset,
        legOffset,
        tailAngle,
        breathingOffset,
        isBlinking,
        headBobOffset,
      );
    } else if (validStance === 'roaring') {
      drawRoaringLion(ctx, config, progress, bodyOffset, legOffset, tailAngle, breathingOffset, headBobOffset);
    } else if (validStance === 'eating') {
      drawEatingLion(
        ctx,
        config,
        progress,
        bodyOffset,
        legOffset,
        tailAngle,
        breathingOffset,
        isBlinking,
        headBobOffset,
      );
    } else {
      // Draw the lion in layers from back to front for standard stances
      drawTail(ctx, tailAngle);

      // Fix for running animation - ensure legs are properly attached to the body
      const adjustedLegOffset =
        validStance === 'running'
          ? Math.min(Math.max(legOffset, -4), 4) // Clamp leg offset for running to prevent detachment
          : legOffset;

      drawHindLeg(ctx, adjustedLegOffset);
      drawBody(ctx, bodyOffset, breathingOffset);
      drawMane(ctx, bodyOffset, validStance);
      drawHead(ctx, bodyOffset + headBobOffset, validStance, isBlinking);
      drawFrontLeg(ctx, adjustedLegOffset);
    }

    // Restore the context state
    ctx.restore();
  },
};

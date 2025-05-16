import { Asset } from '../../../generator-core/src/assets-types';

// --- Color Palette ---
const PALETTE = {
  skyLight: '#87CEEB',
  skyDark: '#4682B4',
  cloudBase: '#FFFFFF',
  cloudShadow: '#D3D3D3',
  plantStem: '#8B4513', // SaddleBrown
  plantLeafLight: '#90EE90',
  plantLeafDark: '#2E8B57',
  lionBody: '#F4A460', // SandyBrown
  lionBodyShadow: '#D2691E', // Chocolate
  lionMane: '#A0522D', // Sienna
  lionManeHighlight: '#8B4513', // SaddleBrown (darker for depth)
  lionNose: '#FFC0CB', // Pink
  lionInnerEar: '#FFDAB9', // PeachPuff
  eyeWhite: '#FFFFFF',
  lionIris: '#FFA500', // Orange
  lionPupil: '#000000',
  titleText: '#FF4500', // OrangeRed
  titleOutline: '#FFD700', // Gold
};

// --- Helper Functions ---
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const easeInOutQuad = (t: number): number => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
const clamp = (val: number, min: number, max: number): number => Math.max(min, Math.min(val, max));

function drawEllipse(ctx: CanvasRenderingContext2D, x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, color: string, anticlockwise: boolean = false) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise);
  ctx.fill();
}

// --- Environment Drawing Helpers ---
function drawSky(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, PALETTE.skyLight);
  gradient.addColorStop(1, PALETTE.skyDark);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

interface Cloud {
  x: number; y: number; size: number; speed: number; parts: { dx: number, dy: number, r: number }[];
}

const clouds: Cloud[] = [
  { x: 0.2, y: 0.15, size: 0.08, speed: 0.05, parts: [{dx:0, dy:0, r:1}, {dx:-0.8, dy:0.1, r:0.7}, {dx:0.7, dy:0.2, r:0.8}] },
  { x: 0.7, y: 0.25, size: 0.1, speed: 0.03, parts: [{dx:0, dy:0, r:1}, {dx:-0.7, dy:-0.1, r:0.8}, {dx:0.8, dy:0.1, r:0.9}, {dx:0, dy:0.3, r:0.7}] },
  { x: 0.5, y: 0.1, size: 0.06, speed: 0.07, parts: [{dx:0, dy:0, r:1}, {dx:0.6, dy:0.1, r:0.6}] },
];

function drawCloud(ctx: CanvasRenderingContext2D, cloud: Cloud, width: number, height: number, progress: number) {
  const cloudX = ((cloud.x * width + progress * cloud.speed * width) % (width * 1.5)) - width * 0.25;
  const cloudY = cloud.y * height;
  const baseSize = cloud.size * Math.min(width, height);

  cloud.parts.forEach(part => {
    const r = baseSize * part.r;
    // Shadow
    drawEllipse(ctx, cloudX + part.dx * baseSize + r * 0.1, cloudY + part.dy * baseSize + r * 0.1, r, r * 0.8, 0, 0, Math.PI * 2, PALETTE.cloudShadow);
    // Main cloud part
    drawEllipse(ctx, cloudX + part.dx * baseSize, cloudY + part.dy * baseSize, r, r * 0.8, 0, 0, Math.PI * 2, PALETTE.cloudBase);
  });
}

interface Plant {
  x: number; heightFactor: number; swayOffset: number; blades: { angle: number, length: number, curve: number }[];
}

const plants: Plant[] = [
  { x: 0.15, heightFactor: 0.2, swayOffset: 0, blades: [{angle: -0.2, length: 1, curve: 0.5}, {angle: 0.1, length: 0.8, curve: -0.3}, {angle: 0.3, length: 0.9, curve: 0.4}] },
  { x: 0.85, heightFactor: 0.25, swayOffset: Math.PI / 2, blades: [{angle: -0.1, length: 1, curve: -0.5}, {angle: 0.2, length: 0.9, curve: 0.3}] },
  { x: 0.5, heightFactor: 0.15, swayOffset: Math.PI, blades: [{angle: 0, length: 1, curve: 0.2}, {angle:0.2, length:0.7, curve:-0.2}] },
];

function drawPlant(ctx: CanvasRenderingContext2D, plant: Plant, width: number, height: number, progress: number) {
  const plantX = plant.x * width;
  const plantBaseY = height;
  const plantHeight = plant.heightFactor * height;
  const sway = Math.sin(progress * Math.PI * 2 + plant.swayOffset) * 0.1; // radians

  plant.blades.forEach(blade => {
    ctx.beginPath();
    ctx.moveTo(plantX, plantBaseY);
    const tipX = plantX + Math.sin(blade.angle + sway) * plantHeight * blade.length;
    const tipY = plantBaseY - Math.cos(blade.angle + sway) * plantHeight * blade.length;
    const ctrlX = plantX + Math.sin(blade.angle + sway + blade.curve * 0.5) * plantHeight * blade.length * 0.5;
    const ctrlY = plantBaseY - Math.cos(blade.angle + sway + blade.curve * 0.5) * plantHeight * blade.length * 0.5;
    
    ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
    
    const gradient = ctx.createLinearGradient(plantX, plantBaseY, plantX, tipY);
    gradient.addColorStop(0, PALETTE.plantLeafDark);
    gradient.addColorStop(1, PALETTE.plantLeafLight);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = Math.max(3, width * 0.01);
    ctx.stroke();
  });
}

// --- Lion Animation Configuration ---
interface LionAnimationTimings {
    // Head lift
    headLiftPhase1Start: number; headLiftPhase1Duration: number; headLiftAmount1Factor: number;
    headLiftPhase2Start: number; headLiftPhase2Duration: number; headLiftAmount2Factor: number;

    // Eyelids
    eyelidOpenStart: number; eyelidOpenDuration: number; eyelidOpenAmount: number; // Default open state
    eyelidBlink1Start: number; eyelidBlink1Duration: number; eyelidBlinkAmountClosed: number; // How much it closes for blink
    eyelidBlink2Start: number; eyelidBlink2Duration: number; // Re-opening after blink

    // Yawn
    yawnStart: number; yawnTotalDuration: number; yawnRelativeOpenFactor: number; 
    yawnMaxAbsoluteOpenSizeFactor: number; 

    // Roar
    roarStart: number; roarDuration: number; roarRelativeOpenFactor: number; 
    roarMaxAbsoluteOpenSizeFactor: number; 

    // Ears
    earPerkStart: number; earPerkDuration: number;
    earAngleResting: number; earAnglePerked: number;
    earTwitchFrequencyFactor: number; earTwitchAmplitude: number;
}

const defaultLionTimings: LionAnimationTimings = {
    headLiftPhase1Start: 0.3, headLiftPhase1Duration: 0.3, headLiftAmount1Factor: -0.2,
    headLiftPhase2Start: 0.8, headLiftPhase2Duration: 0.2, headLiftAmount2Factor: -0.15,

    eyelidOpenStart: 0.15, eyelidOpenDuration: 0.25, eyelidOpenAmount: 0.8,
    eyelidBlink1Start: 0.65, eyelidBlink1Duration: 0.05, eyelidBlinkAmountClosed: 0.1,
    eyelidBlink2Start: 0.7, eyelidBlink2Duration: 0.05,

    yawnStart: 0.4, yawnTotalDuration: 0.3, yawnRelativeOpenFactor: 1.0,
    yawnMaxAbsoluteOpenSizeFactor: 0.15,

    roarStart: 0.9, roarDuration: 0.1, roarRelativeOpenFactor: 0.3,
    roarMaxAbsoluteOpenSizeFactor: 0.05,

    earPerkStart: 0.2, earPerkDuration: 0.2,
    earAngleResting: Math.PI / 6, earAnglePerked: -Math.PI / 12,
    earTwitchFrequencyFactor: 15, earTwitchAmplitude: 0.1,
};

// --- Lion Drawing Helpers ---
function drawLion(ctx: CanvasRenderingContext2D, baseX: number, baseY: number, size: number, animProgress: number, timings: LionAnimationTimings) {
  ctx.save();
  ctx.translate(baseX, baseY);

  const breathOffset = Math.sin(animProgress * Math.PI * 4) * size * 0.01;

  let headLift = 0;
  if (animProgress > timings.headLiftPhase1Start) {
      headLift = lerp(0, size * timings.headLiftAmount1Factor, clamp((animProgress - timings.headLiftPhase1Start) / timings.headLiftPhase1Duration, 0, 1));
  }
  if (animProgress > timings.headLiftPhase2Start) {
      headLift = lerp(headLift, size * timings.headLiftAmount2Factor, clamp((animProgress - timings.headLiftPhase2Start) / timings.headLiftPhase2Duration, 0, 1));
  }
  
  let eyelidOpenness = 0;
  if (animProgress < timings.eyelidOpenStart) {
      eyelidOpenness = 0;
  } else if (animProgress < timings.eyelidOpenStart + timings.eyelidOpenDuration) {
      eyelidOpenness = lerp(0, timings.eyelidOpenAmount, (animProgress - timings.eyelidOpenStart) / timings.eyelidOpenDuration);
  } else {
      eyelidOpenness = timings.eyelidOpenAmount;
  }

  if (animProgress > timings.eyelidBlink1Start && animProgress < timings.eyelidBlink1Start + timings.eyelidBlink1Duration) {
      eyelidOpenness = timings.eyelidBlinkAmountClosed;
  } else if (animProgress >= timings.eyelidBlink2Start && animProgress < timings.eyelidBlink2Start + timings.eyelidBlink2Duration) {
      eyelidOpenness = lerp(timings.eyelidBlinkAmountClosed, timings.eyelidOpenAmount, (animProgress - timings.eyelidBlink2Start) / timings.eyelidBlink2Duration);
  }

  let yawnOpennessFactor = 0;
  if (animProgress > timings.yawnStart && animProgress < timings.yawnStart + timings.yawnTotalDuration) {
    const yawnPhaseProgress = (animProgress - timings.yawnStart) / timings.yawnTotalDuration;
    if (yawnPhaseProgress < 0.5) { 
        yawnOpennessFactor = lerp(0, timings.yawnRelativeOpenFactor, yawnPhaseProgress / 0.5);
    } else { 
        yawnOpennessFactor = lerp(timings.yawnRelativeOpenFactor, 0, (yawnPhaseProgress - 0.5) / 0.5);
    }
  }

  let roarOpennessFactor = 0;
  if (animProgress > timings.roarStart) {
    roarOpennessFactor = lerp(0, timings.roarRelativeOpenFactor, clamp((animProgress - timings.roarStart) / timings.roarDuration, 0, 1));
  }
  const mouthOpen = Math.max(yawnOpennessFactor * (size * timings.yawnMaxAbsoluteOpenSizeFactor), roarOpennessFactor * (size * timings.roarMaxAbsoluteOpenSizeFactor));

  let earAngle = timings.earAngleResting;
  if (animProgress > timings.earPerkStart && animProgress < timings.earPerkStart + timings.earPerkDuration) {
    earAngle = lerp(timings.earAngleResting, timings.earAnglePerked, (animProgress - timings.earPerkStart) / timings.earPerkDuration);
    earAngle += Math.sin(animProgress * Math.PI * timings.earTwitchFrequencyFactor) * timings.earTwitchAmplitude;
  } else if (animProgress >= timings.earPerkStart + timings.earPerkDuration) {
    earAngle = timings.earAnglePerked;
  }

  // Adjusted proportions: Body smaller relative to head
  const bodyRadiusY = size * 0.24 + breathOffset; // Original: 0.3
  const bodyRadiusX = size * 0.32; // Original: 0.4
  const headRadius = size * 0.25;
  const headX = 0;
  const headY = -bodyRadiusY * 0.8 + headLift;
  const maneOuterRadius = headRadius * 2.2;
  const maneInnerRadius = headRadius * 1.1;

  // Body Shadow
  drawEllipse(ctx, 0, size * 0.02, bodyRadiusX * 1.05, bodyRadiusY * 1.05, 0, 0, Math.PI * 2, PALETTE.lionBodyShadow);
  // Body
  drawEllipse(ctx, 0, 0, bodyRadiusX, bodyRadiusY, 0, 0, Math.PI * 2, PALETTE.lionBody);

  // Mane
  ctx.fillStyle = PALETTE.lionMane;
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const r = maneOuterRadius * (0.8 + Math.sin(angle * 8 + animProgress * Math.PI) * 0.1); 
    ctx.beginPath();
    ctx.moveTo(headX + Math.cos(angle - 0.1) * maneInnerRadius, headY + Math.sin(angle - 0.1) * maneInnerRadius);
    ctx.lineTo(headX + Math.cos(angle) * r, headY + Math.sin(angle) * r);
    ctx.lineTo(headX + Math.cos(angle + 0.1) * maneInnerRadius, headY + Math.sin(angle + 0.1) * maneInnerRadius);
    ctx.closePath();
    ctx.fill();
  }
  drawEllipse(ctx, headX, headY, maneInnerRadius * 1.1, maneInnerRadius*1.1, 0, 0, Math.PI*2, PALETTE.lionManeHighlight);

  // Head
  drawEllipse(ctx, headX, headY, headRadius, headRadius, 0, 0, Math.PI * 2, PALETTE.lionBody);

  // Ears
  const earSize = headRadius * 0.4;
  [-1, 1].forEach(side => {
    const earX = headX + side * headRadius * 0.8;
    const earY = headY - headRadius * 0.6;
    ctx.save();
    ctx.translate(earX, earY);
    ctx.rotate(side * earAngle);
    drawEllipse(ctx, 0, 0, earSize, earSize * 1.2, 0, 0, Math.PI * 2, PALETTE.lionBodyShadow);
    drawEllipse(ctx, 0, -earSize*0.1, earSize*0.9, earSize * 1.1, 0, 0, Math.PI * 2, PALETTE.lionBody);
    drawEllipse(ctx, 0, earSize*0.1, earSize * 0.5, earSize * 0.6, 0, 0, Math.PI*2, PALETTE.lionInnerEar);
    ctx.restore();
  });

  // Eyes
  const eyeSpacing = headRadius * 0.4;
  const eyeY = headY - headRadius * 0.1;
  const eyeSize = headRadius * 0.25;
  [-1, 1].forEach(side => {
    const eyeX = headX + side * eyeSpacing;
    drawEllipse(ctx, eyeX, eyeY, eyeSize, eyeSize, 0, 0, Math.PI * 2, PALETTE.eyeWhite);
    const irisSize = eyeSize * 0.7;
    drawEllipse(ctx, eyeX, eyeY, irisSize, irisSize, 0, 0, Math.PI * 2, PALETTE.lionIris);
    const pupilSize = irisSize * 0.5;
    drawEllipse(ctx, eyeX, eyeY, pupilSize, pupilSize, 0, 0, Math.PI * 2, PALETTE.lionPupil);
    if (eyelidOpenness < 1) {
      ctx.fillStyle = PALETTE.lionBody;
      ctx.beginPath();
      ctx.arc(eyeX, eyeY, eyeSize * 1.05, Math.PI, Math.PI * 2, false); 
      ctx.arc(eyeX, eyeY - eyeSize + (eyeSize * 2 * eyelidOpenness), eyeSize * 1.05, 0, Math.PI, true); 
      ctx.closePath();
      ctx.fill();
    }
  });

  // Nose and Mouth
  const noseY = headY + headRadius * 0.25;
  const noseSize = headRadius * 0.2;
  ctx.fillStyle = PALETTE.lionNose;
  ctx.beginPath(); 
  ctx.moveTo(headX, noseY - noseSize * 0.5);
  ctx.lineTo(headX - noseSize, noseY + noseSize * 0.5);
  ctx.lineTo(headX + noseSize, noseY + noseSize * 0.5);
  ctx.closePath();
  ctx.fill();

  const mouthBaseY = noseY + noseSize * 0.8;
  ctx.strokeStyle = PALETTE.lionBodyShadow;
  ctx.lineWidth = size * 0.01;
  ctx.beginPath();
  if (mouthOpen > 0) { 
    ctx.moveTo(headX, mouthBaseY - mouthOpen * 0.5);
    ctx.quadraticCurveTo(headX - headRadius * 0.2, mouthBaseY + mouthOpen * 0.5, headX, mouthBaseY + mouthOpen);
    ctx.quadraticCurveTo(headX + headRadius * 0.2, mouthBaseY + mouthOpen * 0.5, headX, mouthBaseY - mouthOpen * 0.5);
  } else { 
    const breathingMouthOffsetY = breathOffset * 0.3; // Subtle movement for breathing
    const closedMouthY = mouthBaseY + breathingMouthOffsetY;
    ctx.moveTo(headX - headRadius * 0.15, closedMouthY);
    ctx.lineTo(headX + headRadius * 0.15, closedMouthY);
  }
  ctx.stroke();

  ctx.restore();
}

// --- Title Drawing Helper ---
function drawTitle(ctx: CanvasRenderingContext2D, width: number, height: number, animProgress: number) {
  if (animProgress < 0.6) return;

  const titleProgress = clamp((animProgress - 0.6) / 0.4, 0, 1);
  if (titleProgress === 0) return;

  const fontSizeBase = Math.min(width, height) * 0.1;
  const fontSize = lerp(fontSizeBase * 0.5, fontSizeBase, titleProgress);
  
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = lerp(0, 1, titleProgress);

  const titleX = width / 2;
  const titleY = height * 0.2 + lerp(20, 0, titleProgress); 

  ctx.strokeStyle = PALETTE.titleOutline;
  ctx.lineWidth = fontSize * 0.1;
  ctx.strokeText('Hungry Lion', titleX, titleY);
  ctx.fillStyle = PALETTE.titleText;
  ctx.fillText('Hungry Lion', titleX, titleY);

  ctx.globalAlpha = 1;
}

export const hungryLionSplash: Asset = {
  name: 'hungry-lion-splash',
  description: 'A splash screen featuring a more expressive waking lion with nuanced animations. The environment, including clouds and plants with subtle shading, is also animated. The game title \'Hungry Lion\' integrates with the lion\'s awakening.',
  stances: ['default'],
  render: (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, progress: number, stance: string, direction: 'left' | 'right'): void => {
    ctx.save();
    ctx.translate(x, y);

    const animProgress = easeInOutQuad(progress);

    // Determine animation timings based on stance
    // For now, only 'default' stance timings are used.
    // This structure allows for future expansion with other stances.
    let currentLionTimings: LionAnimationTimings;
    if (stance === 'default') {
        currentLionTimings = defaultLionTimings;
    } else {
        // Fallback to default if stance is unrecognized, or define other stance timings
        currentLionTimings = defaultLionTimings; 
    }

    drawSky(ctx, width, height);
    clouds.forEach(cloud => drawCloud(ctx, cloud, width, height, animProgress));
    plants.forEach(plant => drawPlant(ctx, plant, width, height, animProgress));

    const lionSize = Math.min(width, height) * 0.4;
    const lionBaseX = width / 2;
    const lionBaseY = height * 0.65;
    drawLion(ctx, lionBaseX, lionBaseY, lionSize, animProgress, currentLionTimings);

    drawTitle(ctx, width, height, animProgress);

    ctx.restore();
  }
};
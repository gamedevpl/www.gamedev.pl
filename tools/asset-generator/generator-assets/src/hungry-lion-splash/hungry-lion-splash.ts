import { Asset } from '../../../generator-core/src/assets-types';

// Easing function (Sine)
function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

// Helper function to draw a cloud with animation
function drawCloud(
  ctx: CanvasRenderingContext2D,
  baseX: number,
  baseY: number,
  baseWidth: number,
  baseHeight: number,
  color: string,
  progress: number,
  animSeed: number,
) {
  const animFactorX = Math.sin(progress * Math.PI * (0.3 + animSeed * 0.1)) * baseWidth * 0.1;
  const animFactorY = Math.cos(progress * Math.PI * (0.4 + animSeed * 0.1)) * baseHeight * 0.1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(baseX + animFactorX, baseY + animFactorY, baseWidth, baseHeight, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(
    baseX + baseWidth * 0.5 + animFactorX * 0.8,
    baseY + baseHeight * 0.2 + animFactorY * 0.8,
    baseWidth * 0.8,
    baseHeight * 0.8,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
}

// Helper function to draw a plant leaf (ellipse) with animation
function drawPlantLeaf(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  width: number,
  height: number,
  initialRotation: number,
  color: string,
  progress: number,
  animSeed: number,
) {
  const sway = 0.1 * Math.sin(progress * Math.PI * 2 * (1.0 + animSeed * 0.2));
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, width, height, initialRotation + sway, 0, Math.PI * 2);
  ctx.fill();
}

// Helper function to draw the tall plant with animation
function drawTallPlant(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  plantColor: string,
  progress: number,
  animSeed: number,
) {
  const swayCtrlX = width * 0.2 * Math.sin(progress * Math.PI * 2 * (1.2 + animSeed * 0.1));
  const swayCtrlY = height * 0.1 * Math.cos(progress * Math.PI * 2 * (1.2 + animSeed * 0.1));
  ctx.fillStyle = plantColor;
  ctx.beginPath();
  ctx.moveTo(x, y + height); // bottom left
  ctx.quadraticCurveTo(x + width * 0.3 + swayCtrlX, y + height * 0.3 + swayCtrlY, x + width * 0.5, y); // tip
  ctx.quadraticCurveTo(x + width * 0.7 - swayCtrlX, y + height * 0.3 - swayCtrlY, x + width, y + height); // bottom right
  ctx.closePath();
  ctx.fill();
}

// Helper function to draw an eye with wake-up and blinking animation
function drawAnimatedEye(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  eyeRadius: number,
  pupilRadius: number,
  eyeColor: string,
  pupilColor: string,
  headScale: number,
  openRatio: number,
  directionFactor: number,
) {
  if (openRatio < 0.05) {
    // Draw closed eye line
    ctx.strokeStyle = pupilColor;
    ctx.lineWidth = headScale * 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - eyeRadius * 0.8, cy);
    ctx.quadraticCurveTo(cx, cy + eyeRadius * 0.3 * (1 - openRatio / 0.05), cx + eyeRadius * 0.8, cy); // Make closing smoother
    ctx.stroke();
  } else {
    ctx.fillStyle = eyeColor;
    ctx.beginPath();
    ctx.ellipse(cx, cy, eyeRadius, eyeRadius * openRatio, 0, 0, Math.PI * 2);
    ctx.fill();

    if (openRatio > 0.5) {
      // Only draw pupil if eye is reasonably open
      const pupilOffsetY = pupilRadius * 0.1 * openRatio; // Pupil moves slightly down as eye opens
      const pupilOffsetX = pupilRadius * 0.2 * directionFactor;
      ctx.fillStyle = pupilColor;
      ctx.beginPath();
      ctx.arc(cx + pupilOffsetX, cy + pupilOffsetY, pupilRadius * Math.min(1, openRatio * 2), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Helper function to draw an eyebrow with animation
function drawEyebrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  eyeTopY: number,
  eyeRadius: number,
  headRadius: number,
  progress: number,
  animSeed: number,
  color: string,
  lineWidth: number,
) {
  const eyebrowRaiseFactor = 0.05 * Math.sin(progress * Math.PI * 2 * (2.0 + animSeed * 0.3)); // Dynamic raise/lower
  const eyebrowArchFactor = 0.08 + 0.04 * Math.cos(progress * Math.PI * 2 * (1.5 + animSeed * 0.2)); // Dynamic arch
  const eyebrowY = eyeTopY - headRadius * 0.08 - headRadius * eyebrowRaiseFactor;

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(cx - eyeRadius * 0.9, eyebrowY + headRadius * 0.01);
  ctx.quadraticCurveTo(
    cx,
    eyebrowY - headRadius * eyebrowArchFactor,
    cx + eyeRadius * 0.9,
    eyebrowY + headRadius * 0.01,
  );
  ctx.stroke();
}

export const HungryLionSplash: Asset = {
  name: 'hungry-lion-splash',
  stances: ['default'],
  description: `
# Hungry Lion Splash Screen

This is a splash screen for a game featuring a hungry lion. The lion is depicted in a cartoonish style, with exaggerated features and vibrant colors. The background is a jungle scene, with lush greenery and tropical plants. The lion's expression is playful and mischievous, inviting players to join in the fun.

## Description

The splash screen features a cartoonish lion with a big smile, surrounded by tropical plants and trees. The lion is in the center of the screen, with its mouth open as if roaring playfully. The background is a vibrant jungle scene, filled with various shades of green and colorful flowers. The overall feel is fun and inviting, perfect for a game setting.

Above the lion there should be a "Hungry Lion" game title in a playful font, with a slight bounce effect to match the lion's animation. The title should be colorful and eye-catching, drawing players' attention to the game.

## Usage

This splash screen can be used as an introduction to a game, setting the tone for a fun and adventurous experience. It can be displayed when the game is loading or starting up, giving players a glimpse of the game's theme and style.
The game is a web application, and the splash screen is displayed in a canvas element. The lion's animation is simple, with a slight bounce effect to make it more engaging. The background is static, but the colors are bright and eye-catching.

The rendering should work well for different proportions and screen sizes, ensuring that the lion remains the focal point of the splash screen. The canvas should be responsive, adapting to various devices and resolutions.

## Implementation

The splash screen is implemented using HTML5 canvas. The lion is drawn using basic shapes and colors, with a simple animation effect to make it more lively. The background is a static image of a jungle scene, which is drawn behind the lion.
The lion's animation is achieved using a simple bounce effect, where the lion moves up and down slightly to create a playful appearance. The canvas is cleared and redrawn at regular intervals to create the animation effect.
The lion's position and size are adjustable, allowing for customization based on the game's requirements. The canvas is responsive, adapting to different screen sizes while maintaining the aspect ratio of the lion and background.
The splash screen is designed to be lightweight and efficient, ensuring quick loading times and smooth performance. The colors are bright and vibrant, making the lion stand out against the jungle background. The overall design is fun and engaging, perfect for attracting players' attention and setting the mood for the game.

Do not use gradients or complex patterns in the rendering. The lion should be drawn using solid colors and simple shapes to maintain a cartoonish style. The background should also be simple, with a focus on vibrant colors rather than intricate details.

Render function should be hermetic, meaning it should not depend on any external state or variables. It should only use the parameters passed to it to render the lion and background. This ensures that the rendering is consistent and reliable, regardless of the environment or context in which it is used.
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
    ctx.save();
    ctx.translate(x, y);

    if (direction === 'left') {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }

    switch (stance) {
      case 'default':
        {
          const skyColor = '#77C6F0';
          const groundColor = '#66BB6A';
          const plantColorDark = '#388E3C';
          const plantColorLight = '#81C784';
          const cloudColor = '#FFFFFF';
          const flowerColors = ['#FF69B4', '#FFD700', '#9370DB'];

          const lionBodyColor = '#FBC02D';
          const lionManeColor = '#B87333';
          const lionManeDetailColor = '#8B4513';
          const lionMuzzleColor = '#FFF8DC';
          const lionNoseColor = '#A0522D';
          const lionNoseHighlightColor = '#D2B48C';
          const mouthInsideColor = '#8B0000';
          const tongueColor = '#FFB6C1';
          const eyeColor = '#FFFFFF';
          const pupilColor = '#000000';
          const whiskerColor = '#444444';

          // Background
          ctx.fillStyle = skyColor;
          ctx.fillRect(0, 0, width, height * 0.65);
          drawCloud(ctx, width * 0.2, height * 0.15, width * 0.15, height * 0.08, cloudColor, progress, 0.1);
          drawCloud(ctx, width * 0.75, height * 0.22, width * 0.2, height * 0.08 * 1.2, cloudColor, progress, 0.5);
          ctx.fillStyle = groundColor;
          ctx.fillRect(0, height * 0.65, width, height * 0.35);
          drawPlantLeaf(
            ctx,
            width * 0.15,
            height * 0.8,
            width * 0.12,
            height * 0.18,
            -Math.PI / 7,
            plantColorDark,
            progress,
            0.1,
          );
          drawPlantLeaf(
            ctx,
            width * 0.22,
            height * 0.75,
            width * 0.1,
            height * 0.13,
            Math.PI / 5,
            plantColorLight,
            progress,
            0.2,
          );
          drawTallPlant(ctx, width * 0.03, height * 0.65, width * 0.1, height * 0.3, plantColorDark, progress, 0.3);
          drawPlantLeaf(
            ctx,
            width * 0.85,
            height * 0.8,
            width * 0.12,
            height * 0.18,
            Math.PI / 7,
            plantColorDark,
            progress,
            0.4,
          );
          drawPlantLeaf(
            ctx,
            width * 0.78,
            height * 0.75,
            width * 0.1,
            height * 0.13,
            -Math.PI / 5,
            plantColorLight,
            progress,
            0.5,
          );
          const flowerRadius = Math.min(width, height) * 0.015;
          ctx.fillStyle = flowerColors[0];
          ctx.beginPath();
          ctx.arc(width * 0.3, height * 0.9, flowerRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = flowerColors[1];
          ctx.beginPath();
          ctx.arc(width * 0.7, height * 0.88, flowerRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = flowerColors[2];
          ctx.beginPath();
          ctx.arc(width * 0.5, height * 0.92, flowerRadius, 0, Math.PI * 2);
          ctx.fill();

          // Lion
          const baseScale = Math.min(width * 0.4, height * 0.5) / 100;
          const bounceAmplitude = height * 0.015;
          const generalBounceOffsetY = Math.sin(progress * Math.PI * 2) * bounceAmplitude;

          const wakeUpDuration = 0.35; // Slightly longer for smoother visual
          let eyeOpenRatio = 1.0;
          let awakeAnimProgress = 0;
          let easedWakeUpProgress = 0;

          if (progress < wakeUpDuration) {
            easedWakeUpProgress = easeInOutSine(progress / wakeUpDuration);
            eyeOpenRatio = easedWakeUpProgress;
            awakeAnimProgress = 0;
          } else {
            easedWakeUpProgress = 1.0;
            eyeOpenRatio = 1.0;
            awakeAnimProgress = (progress - wakeUpDuration) / (1 - wakeUpDuration);
            const blinkTimeWarp = 0.1 * Math.sin(awakeAnimProgress * Math.PI * 3.0);
            const effectiveBlinkProgress = awakeAnimProgress + blinkTimeWarp;
            const blinkCycleLength = 1.5 + 0.5 * Math.sin(Math.floor(effectiveBlinkProgress * 2.5) * 1.23);
            const blinkTotalDuration = 0.2 + 0.05 * Math.cos(Math.floor(effectiveBlinkProgress * 2.5) * 2.34);
            const blinkPhase = (effectiveBlinkProgress * 4) % blinkCycleLength;
            if (blinkPhase < blinkTotalDuration) {
              const blinkProgressPercent = blinkPhase / blinkTotalDuration;
              // IMPROVEMENT: Apply easing to blink animation for smoother eye movement
              if (blinkProgressPercent < 0.33) eyeOpenRatio = 1.0 - easeInOutSine(blinkProgressPercent / 0.33);
              else if (blinkProgressPercent < 0.66) eyeOpenRatio = 0.0;
              else eyeOpenRatio = easeInOutSine((blinkProgressPercent - 0.66) / 0.34);
            }
          }

          let bodySettleOffsetY = 0;
          if (progress < wakeUpDuration) {
            bodySettleOffsetY = baseScale * 3 * Math.sin(easedWakeUpProgress * Math.PI); // Gentle rise and settle
          }

          const lionCenterX = width / 2;
          const currentLionBaseY = height * 0.6 + generalBounceOffsetY + bodySettleOffsetY;

          // Tail (Animated)
          const tailMovementProgress = progress < wakeUpDuration ? easedWakeUpProgress : awakeAnimProgress;
          const wagFrequency =
            progress < wakeUpDuration ? 2 + 2 * easedWakeUpProgress : 3 + Math.sin(awakeAnimProgress * Math.PI * 0.7);
          const wagAmplitudeFactor =
            progress < wakeUpDuration
              ? 0.3 + 0.7 * easedWakeUpProgress
              : 1 + 0.15 * Math.cos(awakeAnimProgress * Math.PI * 1.3);
          const tailWagPhase = progress * Math.PI * wagFrequency * 0.5;

          const tailBaseX = lionCenterX + baseScale * 40;
          const tailBaseY = currentLionBaseY + baseScale * 10;
          const tailEndX = lionCenterX + baseScale * (65 + Math.cos(tailWagPhase * 0.3) * 5 * wagAmplitudeFactor);
          const tailEndY = currentLionBaseY - baseScale * (35 - Math.sin(tailWagPhase) * 15 * wagAmplitudeFactor);
          const ctrl1X = tailBaseX + baseScale * 30;
          const ctrl1Y = tailBaseY - baseScale * (40 + Math.cos(tailWagPhase * 1.1) * 10 * wagAmplitudeFactor);
          const ctrl2X = tailEndX + baseScale * (20 + Math.sin(tailWagPhase * 0.8) * 10 * wagAmplitudeFactor);
          const ctrl2Y = tailEndY + baseScale * (45 + Math.cos(tailWagPhase * 1.2) * 15 * wagAmplitudeFactor);

          ctx.strokeStyle = lionBodyColor;
          ctx.lineWidth = baseScale * 6;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(tailBaseX, tailBaseY);
          ctx.bezierCurveTo(ctrl1X, ctrl1Y, ctrl2X, ctrl2Y, tailEndX, tailEndY);
          ctx.stroke();

          const tailTuftRadius = baseScale * (10 + 2 * Math.sin(tailWagPhase * 1.5));
          ctx.fillStyle = lionManeColor;
          ctx.beginPath();
          ctx.arc(tailEndX, tailEndY, tailTuftRadius, 0, Math.PI * 2);
          ctx.fill();

          // Legs
          const legWidth = baseScale * 20;
          const legHeight = baseScale * 35;
          const pawRadius = baseScale * 12;
          ctx.fillStyle = lionBodyColor;
          const legXOffset = baseScale * 30;
          const legY = currentLionBaseY + baseScale * 20;
          ctx.beginPath();
          ctx.roundRect(lionCenterX - legXOffset - legWidth / 2, legY, legWidth, legHeight, baseScale * 5);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(lionCenterX - legXOffset, legY + legHeight - pawRadius * 0.7, pawRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.roundRect(lionCenterX + legXOffset - legWidth / 2, legY, legWidth, legHeight, baseScale * 5);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(lionCenterX + legXOffset, legY + legHeight - pawRadius * 0.7, pawRadius, 0, Math.PI * 2);
          ctx.fill();

          // Body
          const bodyWidth = baseScale * 90;
          const bodyHeight = baseScale * 70;
          ctx.fillStyle = lionBodyColor;
          ctx.beginPath();
          ctx.ellipse(lionCenterX, currentLionBaseY, bodyWidth / 2, bodyHeight / 2, 0, 0, Math.PI * 2);
          ctx.fill();

          // Belly Patch
          ctx.fillStyle = lionMuzzleColor;
          ctx.beginPath();
          ctx.ellipse(lionCenterX, currentLionBaseY + baseScale * 10, bodyWidth / 3, bodyHeight / 3, 0, 0, Math.PI * 2);
          ctx.fill();

          // Head Calculations
          const headRadius = baseScale * 38;
          const headX = lionCenterX;
          let headBobOffsetY = 0;
          let headTiltAngle = 0;
          if (progress >= wakeUpDuration) {
            headBobOffsetY = Math.sin(awakeAnimProgress * Math.PI * 2.8) * baseScale * 1.5;
            headTiltAngle = 0.04 * Math.sin(awakeAnimProgress * Math.PI * 1.8);
          }
          const dynamicHeadY = currentLionBaseY - bodyHeight / 2 + headRadius * 0.15 + headBobOffsetY;

          ctx.save();
          ctx.translate(headX, dynamicHeadY);
          ctx.rotate(headTiltAngle);
          ctx.translate(-headX, -dynamicHeadY);

          // Mane
          ctx.fillStyle = lionManeColor;
          const maneOuterRadius = headRadius * 1.6;
          const numManePoints = 12;
          ctx.beginPath();
          for (let i = 0; i < numManePoints; i++) {
            const angle = (i / numManePoints) * Math.PI * 2;
            const r = i % 2 === 0 ? maneOuterRadius : maneOuterRadius * 0.85;
            const px = headX + Math.cos(angle) * r;
            const py = dynamicHeadY + Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = lionManeDetailColor;
          const numManeDetailPoints = 10;
          const maneDetailRadiusFactor = 1.2;
          for (let i = 0; i < numManeDetailPoints; i++) {
            const angle = (i / numManeDetailPoints) * Math.PI * 2 + Math.PI / numManeDetailPoints;
            const rOuter = headRadius * maneDetailRadiusFactor;
            const rInner = headRadius * maneDetailRadiusFactor * 0.6;
            ctx.beginPath();
            ctx.moveTo(headX + Math.cos(angle - 0.1) * rInner, dynamicHeadY + Math.sin(angle - 0.1) * rInner);
            ctx.lineTo(headX + Math.cos(angle) * rOuter, dynamicHeadY + Math.sin(angle) * rOuter);
            ctx.lineTo(headX + Math.cos(angle + 0.1) * rInner, dynamicHeadY + Math.sin(angle + 0.1) * rInner);
            ctx.closePath();
            ctx.fill();
          }

          ctx.fillStyle = lionBodyColor;
          ctx.beginPath();
          ctx.arc(headX, dynamicHeadY, headRadius, 0, Math.PI * 2);
          ctx.fill();

          // Ears
          const earRadius = headRadius * 0.35;
          const earOffset = headRadius * 0.85;
          let earPerkY = 0;
          let earTwitchRot = 0;
          if (progress < wakeUpDuration) {
            earPerkY = -easedWakeUpProgress * headRadius * 0.1;
          } else {
            earPerkY = Math.sin(awakeAnimProgress * Math.PI * 3.5) * headRadius * 0.03;
            earTwitchRot = Math.sin(awakeAnimProgress * Math.PI * 2.5) * 0.1;
          }

          const drawEar = (earCenterX: number, earCenterYBase: number, rotation: number) => {
            ctx.save();
            ctx.translate(earCenterX, earCenterYBase + earPerkY);
            ctx.rotate(rotation);
            ctx.fillStyle = lionBodyColor;
            ctx.beginPath();
            ctx.arc(0, 0, earRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = lionManeColor;
            ctx.beginPath();
            ctx.arc(0, 0, earRadius * 0.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          };
          drawEar(headX - earOffset, dynamicHeadY - earOffset * 0.7, -earTwitchRot);
          drawEar(headX + earOffset, dynamicHeadY - earOffset * 0.7, earTwitchRot);

          // Muzzle (subtly animated)
          const muzzleWidth = headRadius * 1.1;
          let muzzleHeight = headRadius * 0.7;
          const currentMuzzleAnimProgress = progress < wakeUpDuration ? easedWakeUpProgress * 0.6 : awakeAnimProgress;
          const muzzleAnimFactor = 0.05 * Math.sin(currentMuzzleAnimProgress * Math.PI * 2 * 1.8);
          muzzleHeight *= 1 + muzzleAnimFactor;
          ctx.fillStyle = lionMuzzleColor;
          ctx.beginPath();
          ctx.ellipse(headX, dynamicHeadY + headRadius * 0.25, muzzleWidth / 2, muzzleHeight / 2, 0, 0, Math.PI * 2);
          ctx.fill();

          // Nose
          ctx.fillStyle = lionNoseColor;
          const noseWidth = headRadius * 0.3;
          const noseHeight = headRadius * 0.25;
          const noseTipY = dynamicHeadY + headRadius * 0.1 + noseHeight;
          ctx.beginPath();
          ctx.moveTo(headX - noseWidth / 2, dynamicHeadY + headRadius * 0.1);
          ctx.lineTo(headX + noseWidth / 2, dynamicHeadY + headRadius * 0.1);
          ctx.lineTo(headX, noseTipY);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = lionNoseHighlightColor;
          ctx.beginPath();
          ctx.arc(
            headX - noseWidth * 0.15,
            dynamicHeadY + headRadius * 0.1 + noseHeight * 0.3,
            noseWidth * 0.15,
            0,
            Math.PI * 2,
          );
          ctx.fill();

          // Eyes (Animated)
          const eyeRadius = headRadius * 0.18;
          const pupilRadius = eyeRadius * 0.5;
          const eyeDistX = headRadius * 0.4;
          const eyeYPos = dynamicHeadY - headRadius * 0.15;
          drawAnimatedEye(
            ctx,
            headX - eyeDistX,
            eyeYPos,
            eyeRadius,
            pupilRadius,
            eyeColor,
            pupilColor,
            baseScale,
            eyeOpenRatio,
            1,
          );
          drawAnimatedEye(
            ctx,
            headX + eyeDistX,
            eyeYPos,
            eyeRadius,
            pupilRadius,
            eyeColor,
            pupilColor,
            baseScale,
            eyeOpenRatio,
            -1,
          );

          // Eyebrows (Animated)
          const eyebrowAnimProgress = progress < wakeUpDuration ? easedWakeUpProgress : awakeAnimProgress;
          drawEyebrow(
            ctx,
            headX - eyeDistX,
            eyeYPos - eyeRadius,
            eyeRadius,
            headRadius,
            eyebrowAnimProgress,
            0.1,
            pupilColor,
            baseScale * 1.5,
          );
          drawEyebrow(
            ctx,
            headX + eyeDistX,
            eyeYPos - eyeRadius,
            eyeRadius,
            headRadius,
            eyebrowAnimProgress,
            0.2,
            pupilColor,
            baseScale * 1.5,
          );

          // Mouth (Animated)
          let mouthY = dynamicHeadY + headRadius * 0.45;
          const mouthOuterWidthBase = headRadius * 0.6;
          // let mouthDepth = headRadius * 0.3; // Original initialization, now handled differently
          const mouthOpenFactor = progress < wakeUpDuration ? easedWakeUpProgress : 1.0;
          const mouthExpressionFactor = 0.15 * Math.sin(awakeAnimProgress * Math.PI * 2.5); // Smile widens/contracts when awake
          const smileWidthBonus =
            progress < wakeUpDuration ? 0 : Math.max(0, mouthExpressionFactor * 1.2) * headRadius * 0.1; // More pronounced smile width
          const currentMouthOuterWidth = mouthOuterWidthBase + smileWidthBonus;

          // IMPROVEMENT: Refine mouth depth calculation for more natural shape and animation
          let mouthDepth = headRadius * 0.3 * mouthOpenFactor; // Base open depth
          const expressionModulation = 1 + mouthExpressionFactor * 0.6; // Soften expression's impact on depth variation
          mouthDepth *= expressionModulation;
          mouthDepth = Math.max(headRadius * 0.03 * mouthOpenFactor, mouthDepth); // Ensure minimum depth, proportional to openFactor

          mouthY += headRadius * 0.02 * Math.cos(awakeAnimProgress * Math.PI * 2.5) * mouthOpenFactor;
          // Ensure mouth doesn't invert if expressionFactor is too negative (already handled by Math.max above)

          ctx.fillStyle = mouthInsideColor;
          ctx.beginPath();
          ctx.ellipse(headX, mouthY, currentMouthOuterWidth / 2, mouthDepth / 2, 0, 0, Math.PI * 2); // Full ellipse for mouth shape flexibility
          ctx.fill();

          // Tongue (visible if mouth is open enough)
          if (mouthDepth > headRadius * 0.05 && mouthOpenFactor > 0.1) {
            ctx.fillStyle = tongueColor;
            ctx.beginPath();
            ctx.ellipse(
              headX,
              mouthY + mouthDepth * 0.15,
              currentMouthOuterWidth * 0.3,
              mouthDepth * 0.3, // Tongue size relative to current mouth depth
              0,
              0,
              Math.PI * 2,
            );
            ctx.fill();
          }

          // Whiskers
          ctx.strokeStyle = whiskerColor;
          ctx.lineWidth = baseScale * 0.8;
          const whiskerAnimProgress = progress < wakeUpDuration ? easedWakeUpProgress * 0.5 : awakeAnimProgress;
          for (let i = 0; i < 3; i++) {
            const whiskerBaseY = dynamicHeadY + headRadius * 0.25 + i * baseScale * 3;
            const length = headRadius * 0.4 + i * baseScale * 2;
            const animSeed = i * 0.1; // per whisker variation
            const angleOffset =
              (i - 1) * baseScale * 3 +
              baseScale * 2 * Math.sin(whiskerAnimProgress * Math.PI * (2 + i * 0.3 + animSeed * 0.2));
            // Left
            ctx.beginPath();
            ctx.moveTo(headX - muzzleWidth * 0.4, whiskerBaseY);
            ctx.lineTo(headX - muzzleWidth * 0.4 - length, whiskerBaseY + angleOffset);
            ctx.stroke();
            // Right
            ctx.beginPath();
            ctx.moveTo(headX + muzzleWidth * 0.4, whiskerBaseY);
            ctx.lineTo(headX + muzzleWidth * 0.4 + length, whiskerBaseY + angleOffset);
            ctx.stroke();
          }

          ctx.restore(); // Restore context from head tilt/bob
        }
        break;
    }
    ctx.restore(); // Restore context from initial translate and potential flip
  },
};

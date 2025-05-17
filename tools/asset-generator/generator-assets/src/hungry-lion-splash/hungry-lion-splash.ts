import { Asset } from '../../../generator-core/src/assets-types';

export const HungryLionSplash: Asset = {
  name: 'hungry-lion-splash',
  description: `# Hungry Lion Game Splash Screen
  
A splash screen featuring a hungry lion in a cartoonish style, with a jungle background and animated title.

## Description

The splash screen features a cartoonish lion with a big smile, surrounded by tropical plants and trees. The lion is in the center of the screen, with its mouth open as if roaring playfully. The background is a vibrant jungle scene, filled with various shades of green and colorful flowers. The overall feel is fun and inviting, perfect for a game setting.

Above the lion there should be a "Hungry Lion" game title in a playful font, with a slight bounce effect to match the lion's animation. The title should be colorful and eye-catching, drawing players' attention to the game.

## Stances

- **Initialising**: The splash screen is appearing after player opened the game. Scena starts from some savanna background and the lion is not yet fully visible. Then the lion walks in
- **Persistent**: The splash screen is fully loaded and displayed. Lion is sitting in the center of the screen, and there are waves coming out of its stomach, indicating that it is hungry.

## Lion

Lion is cartoonish, with a big smile and a playful expression. It has a round head, large eyes, and a fluffy mane. The lion's body is plump and round, giving it a cute appearance. The lion's mouth is open in a wide grin, showing its teeth and tongue. The lion's ears are large and rounded, with a light pink color on the inside.
The most important feature of the lion is its big, round belly, which is slightly exaggerated to emphasize its hunger. The lion's paws are small and rounded, with short claws. The lion's tail is short and fluffy, with a tuft of fur at the end.

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
  referenceImage: undefined,
  stances: ['initialising', 'persistent'],
  render: (ctx, x, y, width, height, progress, stance, direction) => {
    ctx.save();

    const centerX = x + width / 2;
    const centerY = y + height / 2;

    const lionBaseSize = Math.min(width, height) * 0.35;
    const titleBaseFontSize = Math.min(width, height) * 0.08;

    // Define new body proportions here for consistent use
    const lionBodyProportionX = 0.50; // Made wider for a "big, round belly"
    const lionBodyProportionY = 0.48; // Adjusted for plumpness, was 0.45

    const drawBackground = (bgAlpha: number) => {
      ctx.globalAlpha = bgAlpha;
      ctx.fillStyle = "#87CEEB";
      ctx.fillRect(x, y, width, height);

      ctx.fillStyle = "#32CD32";
      ctx.fillRect(x, y + height * 0.75, width, height * 0.25);

      const drawTree = (
        treeX: number,
        treeCrownY: number,
        trunkH: number,
        crownR: number,
        trunkColor: string,
        crownColor: string,
      ) => {
        ctx.fillStyle = trunkColor;
        const trunkW = crownR * 0.3;
        ctx.fillRect(treeX - trunkW / 2, treeCrownY, trunkW, trunkH);
        ctx.fillStyle = crownColor;
        ctx.beginPath();
        ctx.arc(treeX, treeCrownY, crownR, 0, Math.PI * 2);
        ctx.fill();
      };

      drawTree(x + width * 0.2, y + height * 0.75 - height * 0.15, height * 0.2, height * 0.15, "#8B4513", "#2E8B57");
      drawTree(x + width * 0.8, y + height * 0.75 - height * 0.25, height * 0.3, height * 0.2, "#A0522D", "#006400");

      const drawBush = (bushX: number, bushY: number, bushR: number, bushColor: string, flowerColor: string) => {
        ctx.fillStyle = bushColor;
        ctx.beginPath();
        ctx.arc(bushX, bushY, bushR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = flowerColor;
        const flowerPositions = [
          { dx: 0, dy: 0 },
          { dx: -bushR * 0.5, dy: -bushR * 0.3 },
          { dx: bushR * 0.5, dy: -bushR * 0.2 },
          { dx: bushR * 0.3, dy: bushR * 0.4 },
        ];
        flowerPositions.forEach((pos) => {
          ctx.beginPath();
          ctx.arc(bushX + pos.dx, bushY + pos.dy, bushR * 0.2, 0, Math.PI * 2);
          ctx.fill();
        });
      };

      drawBush(x + width * 0.35, y + height * 0.8, height * 0.08, "#556B2F", "#FFD700");
      drawBush(x + width * 0.65, y + height * 0.82, height * 0.1, "#6B8E23", "#FF69B4");
      ctx.globalAlpha = 1;
    };

    interface LionAnimParams {
        pawLeftYOffset?: number;
        pawRightYOffset?: number;
        tailSwayProgress?: number;
    }

    const drawLion = (lionDrawCenterX: number, lionDrawCenterY_head: number, currentManeSize: number, lionAlpha: number, lionDirection: 'left' | 'right', animParams: LionAnimParams) => {
      if (currentManeSize <= 1) return;
      ctx.globalAlpha = lionAlpha;

      const headDiameter = currentManeSize * 0.75;
      const headRadius = headDiameter / 2;
      const bodyColor = "#FFA500";
      // Use defined proportions for body
      const bodyRadiusX = currentManeSize * lionBodyProportionX;
      const bodyRadiusY = currentManeSize * lionBodyProportionY;
      const bodyCenterY = lionDrawCenterY_head + headRadius * 0.8 + bodyRadiusY * 0.5;

      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.ellipse(lionDrawCenterX, bodyCenterY, bodyRadiusX, bodyRadiusY, 0, 0, Math.PI * 2);
      ctx.fill();

      const tailSideMultiplier = (lionDirection === 'left' ? -1 : 1);
      const tailBaseX = lionDrawCenterX + tailSideMultiplier * (bodyRadiusX * 0.65);
      const tailBaseY = bodyCenterY + bodyRadiusY * 0.1;
      const tailLength = currentManeSize * 0.3;
      const tailCurveHeight = currentManeSize * 0.15;
      let tailEndX = tailBaseX + tailSideMultiplier * tailLength * 0.7;
      const tailEndY = tailBaseY - tailCurveHeight * 1.2;
      let tailCpX = tailBaseX + tailSideMultiplier * tailLength * 0.3;
      const tailCpY = tailBaseY - tailCurveHeight * 1.8;
      const tailWidth = Math.max(2, headRadius * 0.15);
      const tuftRadius = Math.max(5, headRadius * 0.28);

      if (animParams.tailSwayProgress && animParams.tailSwayProgress > 0 && animParams.tailSwayProgress < 0.98) {
        const swayCycle = Math.sin(animParams.tailSwayProgress * 5 * 2 * Math.PI);
        const swayAmount = currentManeSize * 0.03;
        tailEndX += tailSideMultiplier * swayAmount * swayCycle;
        tailCpX += tailSideMultiplier * swayAmount * swayCycle * 0.5;
      }

      ctx.strokeStyle = bodyColor;
      ctx.lineWidth = tailWidth;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tailBaseX, tailBaseY);
      ctx.quadraticCurveTo(tailCpX, tailCpY, tailEndX, tailEndY);
      ctx.stroke();

      ctx.fillStyle = "#D2691E";
      ctx.beginPath();
      ctx.arc(tailEndX, tailEndY, tuftRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#B85C1E";
      ctx.beginPath();
      ctx.arc(tailEndX + tailSideMultiplier * tuftRadius * 0.1, tailEndY - tuftRadius * 0.1, tuftRadius * 0.65, 0, Math.PI * 2);
      ctx.fill();

      const pawColor = bodyColor;
      const pawRadius = Math.max(5, headRadius * 0.40); // Increased paw size
      const pawYOffsetFromBodyCenter = bodyRadiusY * 0.9;
      const basePawY = bodyCenterY + pawYOffsetFromBodyCenter;
      const pawSpreadFromLionCenter = bodyRadiusX * 0.40;
      const leftPawX = lionDrawCenterX - pawSpreadFromLionCenter;
      const rightPawX = lionDrawCenterX + pawSpreadFromLionCenter;

      const numClawsPerPaw = 3;
      const clawHeight = pawRadius * 0.35;
      const clawWidth = pawRadius * 0.25;
      const clawBaseOffsetY = pawRadius * 0.65;
      const clawTipOffsetY = pawRadius * 1.0;

      const pawsData = [
        { x: leftPawX, y: basePawY + (animParams.pawLeftYOffset || 0), side: 'left' },
        { x: rightPawX, y: basePawY + (animParams.pawRightYOffset || 0), side: 'right' }
      ];

      pawsData.forEach(paw => {
        ctx.fillStyle = pawColor;
        ctx.beginPath();
        ctx.arc(paw.x, paw.y, pawRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#8B4513";
        for (let i = 0; i < numClawsPerPaw; i++) {
          const clawCenterXOffset = (i - 1) * (pawRadius * 0.5);
          const clawCenterX = paw.x + clawCenterXOffset;
          ctx.beginPath();
          ctx.moveTo(clawCenterX - clawWidth / 2, paw.y + clawBaseOffsetY);
          ctx.lineTo(clawCenterX + clawWidth / 2, paw.y + clawBaseOffsetY);
          ctx.lineTo(clawCenterX, paw.y + clawTipOffsetY);
          ctx.closePath();
          ctx.fill();
        }
      });

      ctx.fillStyle = "#D2691E";
      ctx.beginPath();
      ctx.arc(lionDrawCenterX, lionDrawCenterY_head, currentManeSize / 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#FFA500";
      ctx.beginPath();
      ctx.arc(lionDrawCenterX, lionDrawCenterY_head, headRadius, 0, Math.PI * 2);
      ctx.fill();

      const earRadiusOuter = headRadius * 0.45;
      const earAttachPointY = lionDrawCenterY_head - headRadius * 0.75;
      const earSpreadX = headRadius * 0.75;

      ctx.fillStyle = "#FFA500";
      ctx.beginPath();
      ctx.arc(lionDrawCenterX - earSpreadX, earAttachPointY, earRadiusOuter, Math.PI, Math.PI * 2, false);
      ctx.fill();
      ctx.fillStyle = "#FFC0CB";
      ctx.beginPath();
      ctx.arc(lionDrawCenterX - earSpreadX, earAttachPointY, earRadiusOuter * 0.6, Math.PI, Math.PI * 2, false);
      ctx.fill();

      ctx.fillStyle = "#FFA500";
      ctx.beginPath();
      ctx.arc(lionDrawCenterX + earSpreadX, earAttachPointY, earRadiusOuter, Math.PI, Math.PI * 2, false);
      ctx.fill();
      ctx.fillStyle = "#FFC0CB";
      ctx.beginPath();
      ctx.arc(lionDrawCenterX + earSpreadX, earAttachPointY, earRadiusOuter * 0.6, Math.PI, Math.PI * 2, false);
      ctx.fill();

      ctx.fillStyle = "#FFFFFF";
      const eyeRadius = headRadius * 0.22;
      const eyeOffsetX = headRadius * 0.38;
      const eyeOffsetY = -headRadius * 0.15;
      ctx.beginPath();
      ctx.arc(lionDrawCenterX - eyeOffsetX, lionDrawCenterY_head + eyeOffsetY, eyeRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(lionDrawCenterX + eyeOffsetX, lionDrawCenterY_head + eyeOffsetY, eyeRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.arc(
        lionDrawCenterX - eyeOffsetX + eyeRadius * 0.1,
        lionDrawCenterY_head + eyeOffsetY + eyeRadius * 0.05,
        eyeRadius * 0.5,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.beginPath();
      ctx.arc(
        lionDrawCenterX + eyeOffsetX + eyeRadius * 0.1,
        lionDrawCenterY_head + eyeOffsetY + eyeRadius * 0.05,
        eyeRadius * 0.5,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      ctx.fillStyle = "#FFDAB9";
      const muzzleWidth = headRadius * 1.1;
      const muzzleHeight = headRadius * 0.8;
      const muzzleCenterY = lionDrawCenterY_head + headRadius * 0.25;
      ctx.beginPath();
      ctx.ellipse(
        lionDrawCenterX,
        muzzleCenterY,
        muzzleWidth / 2,
        muzzleHeight / 2,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      ctx.fillStyle = "#8B0000";
      const noseWidth = headRadius * 0.25;
      const noseHeight = headRadius * 0.18;
      const noseCenterY = muzzleCenterY - muzzleHeight * 0.3;
      ctx.beginPath();
      ctx.ellipse(lionDrawCenterX, noseCenterY, noseWidth / 2, noseHeight / 2, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#8C0000";
      const mouthWidth = headRadius * 0.9;
      const mouthTopY = muzzleCenterY + muzzleHeight * 0.08;
      const mouthBottomY = mouthTopY + headRadius * 0.55;

      ctx.beginPath();
      ctx.moveTo(lionDrawCenterX - mouthWidth / 2, mouthTopY);
      ctx.lineTo(lionDrawCenterX + mouthWidth / 2, mouthTopY);
      ctx.quadraticCurveTo(
          lionDrawCenterX,
          mouthBottomY,
          lionDrawCenterX - mouthWidth / 2,
          mouthTopY
      );
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#FF69B4";
      const tongueBaseWidth = mouthWidth * 0.6;
      const tongueBaseHeight = (mouthBottomY - mouthTopY) * 0.6;
      const tongueY = mouthTopY + (mouthBottomY - mouthTopY) * 0.55;
      ctx.beginPath();
      ctx.ellipse(lionDrawCenterX, tongueY, tongueBaseWidth / 2, tongueBaseHeight / 2, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#FFFFFF";
      const toothWidth = headRadius * 0.15;
      const toothHeight = headRadius * 0.20;
      const teethY = mouthTopY - toothHeight * 0.1;
      const teethGap = toothWidth * 0.25;

      ctx.fillRect(lionDrawCenterX - toothWidth - teethGap / 2, teethY, toothWidth, toothHeight);
      ctx.fillRect(lionDrawCenterX + teethGap / 2, teethY, toothWidth, toothHeight);

      ctx.globalAlpha = 1;
    };

    const drawTitle = (titleDrawX: number, titleDrawY: number, currentTitleFontSize: number, titleAlpha: number) => {
      if (currentTitleFontSize <= 1) return;
      ctx.globalAlpha = titleAlpha;
      ctx.font = `bold ${currentTitleFontSize}px 'Comic Sans MS', 'Arial Rounded MT Bold', 'Verdana', sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = Math.max(1, currentTitleFontSize * 0.1);

      const line1 = "Hungry";
      const line2 = "Lion";
      const lineSpacing = currentTitleFontSize * 0.2;
      const totalTitleHeight = currentTitleFontSize * 2 + lineSpacing;
      const titleBlockCenterY = titleDrawY;
      const titleLine1Y = titleBlockCenterY - totalTitleHeight / 2 + currentTitleFontSize / 2 + currentTitleFontSize * 0.1;
      const titleLine2Y = titleLine1Y + currentTitleFontSize + lineSpacing;

      ctx.fillStyle = "#FFD700";
      ctx.strokeStyle = "#FFA500";
      ctx.strokeText(line1, titleDrawX, titleLine1Y);
      ctx.fillText(line1, titleDrawX, titleLine1Y);

      ctx.fillStyle = "#FFA500";
      ctx.strokeStyle = "#FF4500";
      ctx.strokeText(line2, titleDrawX, titleLine2Y);
      ctx.fillText(line2, titleDrawX, titleLine2Y);
      ctx.globalAlpha = 1;
    };

    const bounceSpeed = 3;
    const titleBounceAmplitude = titleBaseFontSize * 0.15;
    const lionBounceAmplitudePersistent = height * 0.01; // Reduced amplitude for persistent stance
    
    // Use the new body Y proportion for accurate vertical adjustment
    const estimatedBodyRadiusYForPositioning = lionBaseSize * lionBodyProportionY;
    const headVerticalAdjust = estimatedBodyRadiusYForPositioning * 0.4;

    if (stance === 'initialising') {
      const bgFadeInDuration = 0.25;
      const bgAlpha = Math.min(1, progress / bgFadeInDuration);
      drawBackground(bgAlpha);

      const lionWalkInStartProgress = 0.15;
      const lionWalkInDuration = 0.7;
      let lionAnimProgress = 0;
      if (progress >= lionWalkInStartProgress) {
        lionAnimProgress = Math.min(1, (progress - lionWalkInStartProgress) / lionWalkInDuration);
      }

      if (lionAnimProgress > 0) {
        const lionInitialX = x - lionBaseSize * 0.8; // Start off-screen to the left
        const lionTargetX = centerX;
        const currentLionDrawX = lionInitialX + (lionTargetX - lionInitialX) * lionAnimProgress;

        const lionDrawCenterY_head_base = centerY + height * 0.05 - headVerticalAdjust;
        const walkBobAmplitude = lionBaseSize * 0.035;
        const numberOfBobs = 2.5;
        const bobOffset = Math.sin(lionAnimProgress * numberOfBobs * 2 * Math.PI) * walkBobAmplitude * (1 - lionAnimProgress * 0.5);
        const currentLionDrawY_head = lionDrawCenterY_head_base + (lionAnimProgress < 0.95 ? bobOffset : 0);

        const lionEntryScale = 0.6 + 0.4 * lionAnimProgress;
        const currentScaledLionSize = lionBaseSize * lionEntryScale;

        const animParamsForInit: LionAnimParams = {
            pawLeftYOffset: 0,
            pawRightYOffset: 0,
            tailSwayProgress: 0
        };

        if (lionAnimProgress > 0 && lionAnimProgress < 0.98) {
            const walkCycleProgressForPaws = lionAnimProgress * numberOfBobs * 2;
            const pawBobAmplitude = currentScaledLionSize * 0.04; // Increased paw bob amplitude
            animParamsForInit.pawLeftYOffset = Math.sin(walkCycleProgressForPaws * Math.PI) * pawBobAmplitude;
            animParamsForInit.pawRightYOffset = Math.sin(walkCycleProgressForPaws * Math.PI + Math.PI) * pawBobAmplitude;
            animParamsForInit.tailSwayProgress = lionAnimProgress;
        }

        drawLion(currentLionDrawX, currentLionDrawY_head, currentScaledLionSize, lionAnimProgress, direction === 'left' ? 'right' : 'left', animParamsForInit); // Lion faces inward

        const titleTargetYBase = centerY - height * 0.28;
        let currentTitleDrawY;
        const titleAlphaValue = lionAnimProgress;
        const currentScaledTitleFontSize = titleBaseFontSize * lionEntryScale;

        if (lionAnimProgress < 1) {
            const titleInitialY = y - titleBaseFontSize * 2;
            currentTitleDrawY = titleInitialY + (titleTargetYBase - titleInitialY) * lionAnimProgress;
        } else {
            const bounceOffsetY = Math.sin(progress * bounceSpeed) * titleBounceAmplitude;
            currentTitleDrawY = titleTargetYBase + bounceOffsetY;
        }
        drawTitle(centerX, currentTitleDrawY, currentScaledTitleFontSize, titleAlphaValue);
      }
    } else if (stance === 'persistent') {
      drawBackground(1.0);

      const lionGlobalBounceOffsetY = Math.sin(progress * bounceSpeed) * lionBounceAmplitudePersistent;
      const lionDrawCenterX = centerX;
      const lionDrawCenterY_head = centerY + height * 0.05 - headVerticalAdjust + lionGlobalBounceOffsetY;
      const currentLionSize = lionBaseSize;

      drawLion(lionDrawCenterX, lionDrawCenterY_head, currentLionSize, 1.0, direction, {});

      // Use new body Y proportion for waves positioning
      const bodyRadiusYForWaves = currentLionSize * lionBodyProportionY; 
      const headRadiusForWaves = (currentLionSize * 0.75) / 2;
      // Recalculate bodyCenterY for waves without the bounce offset of the head, as waves should originate from the static body center
      const staticLionDrawCenterY_head = centerY + height * 0.05 - headVerticalAdjust;
      const bodyCenterYForWaves = staticLionDrawCenterY_head + headRadiusForWaves * 0.8 + bodyRadiusYForWaves * 0.5;
      const stomachY = bodyCenterYForWaves;

      const waveAnimProgress = (progress * 2.5) % 1;
      const numWaves = 3;
      ctx.lineWidth = Math.max(1, currentLionSize * 0.015);

      for (let i = 0; i < numWaves; i++) {
        const waveIndividualProgress = (waveAnimProgress + (i * 1.0) / numWaves) % 1;
        const radius = waveIndividualProgress * (currentLionSize * 0.25);
        const alpha = (1 - waveIndividualProgress) * 0.7;

        if (alpha > 0 && radius > 1) {
          ctx.strokeStyle = `rgba(230, 230, 250, ${alpha})`;
          ctx.beginPath();
          ctx.arc(lionDrawCenterX, stomachY, radius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      const titleBounceOffsetY = Math.sin(progress * bounceSpeed) * titleBounceAmplitude;
      const titleDrawY = centerY - height * 0.28 + titleBounceOffsetY;
      const currentTitleFontSize = titleBaseFontSize;
      drawTitle(centerX, titleDrawY, currentTitleFontSize, 1.0);
    }

    ctx.restore();
  },
};
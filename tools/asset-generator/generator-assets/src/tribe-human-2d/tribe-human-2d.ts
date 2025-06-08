import { Asset } from '../../../generator-core/src/assets-types';

// Define base dimensions and positions for character parts for Sensible Soccer style
const HEAD_W = 2; // Virtual pixels
const HEAD_H = 2;
const HAIR_TOP_H = 1; // Portion of head height that is hair on top

const TORSO_W = 2;
const TORSO_H = 3;

const ARM_W = 1;
const ARM_H = 2; // Shorter arms for SS style

const LEG_W = 1;
const LEG_H = 2;

// Overall character virtual dimensions (standing)
const CHARACTER_STANDING_VIRTUAL_WIDTH = 4; // Max width including arms at sides
const CHARACTER_STANDING_VIRTUAL_HEIGHT = HEAD_H + TORSO_H + LEG_H; // 2 + 3 + 2 = 7

// Relative positions (in virtual pixel units, before scaling)
const HEAD_X_OFFSET = (CHARACTER_STANDING_VIRTUAL_WIDTH - HEAD_W) / 2; // (4 - 2) / 2 = 1
const TORSO_X_OFFSET = (CHARACTER_STANDING_VIRTUAL_WIDTH - TORSO_W) / 2; // (4 - 2) / 2 = 1

const HEAD_Y_POS = 0;
const TORSO_Y_POS = HEAD_Y_POS + HEAD_H; // 2
const ARM_Y_POS = TORSO_Y_POS + 0.25; // Arms start slightly into torso height: 2.25
const LEG_Y_POS = TORSO_Y_POS + TORSO_H; // Legs start below torso: 2 + 3 = 5

// Arms positioned slightly overlapping/beside the torso for SS feel
const LEFT_ARM_X_POS = TORSO_X_OFFSET - ARM_W * 0.5; // 1 - 0.5 = 0.5
const RIGHT_ARM_X_POS = TORSO_X_OFFSET + TORSO_W - ARM_W * 0.5; // 1 + 2 - 0.5 = 2.5

const LEFT_LEG_X_POS = TORSO_X_OFFSET + 0.25; // Legs slightly inwards from torso edge
const RIGHT_LEG_X_POS = TORSO_X_OFFSET + TORSO_W - LEG_W - 0.25;

// Shadow parameters (Sensible Soccer style)
const SHADOW_COLOR = 'rgba(0, 0, 0, 0.45)'; // Darker, slightly less opaque
const STANDING_SHADOW_W_PX = 3;
const STANDING_SHADOW_H_PX = 1;
const SHADOW_OFFSET_Y_PX = 0.5; // Offset below the character
const SHADOW_OFFSET_X_PX = 0.5; // Offset to the side (non-flipped direction)

export const tribeHuman2D: Asset = {
  name: 'tribeHuman2D',
  referenceImage: 'swos.png',
  description: `A 2D human character asset for the Tribe game. This includes ensuring that the unique animations for stances like 'eat' and 'procreate' do not erroneously appear in other stances, such as 'walk', which was observed in the provided rendered media. The 'idle' animation was updated to a leg sway to better match the provided video for that stance, replacing a simpler body bob.

# Visual style

Human characters in the Tribe game are inspired by classic 2D pixel art, they look like Sensible Soccer players(Sensible Soccer game visual style is IMPORTANT), with a simple and recognizable design. The characters are designed to be easily distinguishable and animated in a way that conveys their actions clearly.

Character in Tribe game look like people from stone age, they have simple clothing, no shoes, and no modern accessories. The characters are designed to be easily distinguishable and animated in a way that conveys their actions clearly.

# Technical details

The asset is rendered on a canvas using the CanvasRenderingContext2D API. The rendering function takes parameters for position, size, progress, stance, direction, gender, and age. The character can face left or right, and the rendering adapts based on the stance (e.g., idle, walk, eat, procreate).
The rendering function must be simple and efficient, it should not use complex patterns or gradients, and should focus on solid colors and basic shapes to maintain the pixel art aesthetic.

15% padding from all edges of the rendering box is required to ensure the character is not cut off during rendering.

# Rendering details

- All parts of the body must be connected
- Rendering must take into account direction vector (X and Y) to flip the character horizontally if needed
- The character's age affects the size and proportions of the body parts, with older characters being larger and more robust

# Stances

- 'idle': The character stands still, with a slight leg sway to indicate life.
- 'walk': The character moves forward, with legs and arms in motion.
- 'gathering': The character is gathering food from berry bushes, with arms reaching out and a slight bend at the knees.
- 'eat': The character holds food and brings it to their mouth, with a slight bend at the knees.
- 'procreate': The character performs a mating animation, with a specific pose and movement.
- 'dead': The character lies on the ground, with limbs relaxed and a neutral expression, slowly turns into a skeleton over time.

`,
  stances: ['idle', 'walk', 'gathering', 'eat', 'procreate', 'dead'],
  render(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    progress: number,
    stance: string,
    gender: 'male' | 'female' = 'male',
    age: number = 20,
    direction: [number, number] = [1, 0],
  ) {
    const directionX = direction[0];

    const padRatio = 0.15;
    const actualX = x + width * padRatio;
    const actualY = y + height * padRatio;
    const actualWidth = width * (1 - 2 * padRatio);
    const actualHeight = height * (1 - 2 * padRatio);

    let charPixelDimX = CHARACTER_STANDING_VIRTUAL_WIDTH;
    let charPixelDimY = CHARACTER_STANDING_VIRTUAL_HEIGHT;

    if (stance === 'dead') {
      // When dead, character is horizontal. Length is old height, thickness is related to old width.
      charPixelDimX = CHARACTER_STANDING_VIRTUAL_HEIGHT; // Length on ground
      charPixelDimY = TORSO_W + 1; // Thickness on ground (max of torso/head thickness)
    }

    let unit: number;
    if (actualWidth / charPixelDimX < actualHeight / charPixelDimY) {
      unit = actualWidth / charPixelDimX;
    } else {
      unit = actualHeight / charPixelDimY;
    }

    const ageMin = 1;
    const ageMax = 60;
    const minScale = 0.7; // Adjusted min scale for smaller base size
    const maxScale = 1.0;
    const ageClamped = Math.max(ageMin, Math.min(age, ageMax));
    const ageScaleFactor = minScale + ((ageClamped - ageMin) / (ageMax - ageMin)) * (maxScale - minScale);
    const scaledUnit = unit * ageScaleFactor;

    const charRenderWidth = charPixelDimX * scaledUnit;
    const charRenderHeight = charPixelDimY * scaledUnit;

    const startDrawX = actualX + (actualWidth - charRenderWidth) / 2;
    const startDrawY = actualY + (actualHeight - charRenderHeight); // Align bottom for standing/actions
    const deadStartDrawY = actualY + (actualHeight - charRenderHeight) / 2; // Align center for dead

    ctx.save();

    const flip = directionX < 0;
    if (flip) {
      ctx.translate(startDrawX + charRenderWidth, stance === 'dead' ? deadStartDrawY : startDrawY);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(startDrawX, stance === 'dead' ? deadStartDrawY : startDrawY);
    }

    const baseSkinColor = gender === 'female' ? '#E8B97C' : '#D09A5A'; // Slightly adjusted skin tones
    const baseHairColor = '#281808'; // Darker, more solid hair
    const baseClothingColor = gender === 'female' ? '#9A6A3F' : '#7F5C4A'; // Muted stone-age clothes
    const boneColor = '#E0D8C0'; // Off-white bone color
    const foodColor = '#A0522D'; // Sienna for food

    const drawPixelRect = (px: number, py: number, pw: number, ph: number, color: string) => {
      if (color === 'transparent') return;
      ctx.fillStyle = color;
      const xPos = Math.floor(px * scaledUnit);
      const yPos = Math.floor(py * scaledUnit);
      const rectWidth = Math.max(1, Math.floor(pw * scaledUnit));
      const rectHeight = Math.max(1, Math.floor(ph * scaledUnit));
      ctx.fillRect(xPos, yPos, rectWidth, rectHeight);
    };

    const drawShadow = (charX: number, charY: number, shadowW: number, shadowH: number) => {
      const shadowActualX = charX + (flip ? -SHADOW_OFFSET_X_PX : SHADOW_OFFSET_X_PX);
      const shadowActualY = charY + SHADOW_OFFSET_Y_PX;
      drawPixelRect(shadowActualX, shadowActualY, shadowW, shadowH, SHADOW_COLOR);
    };

    switch (stance) {
      case 'idle': {
        drawShadow(
          (CHARACTER_STANDING_VIRTUAL_WIDTH - STANDING_SHADOW_W_PX) / 2,
          CHARACTER_STANDING_VIRTUAL_HEIGHT - STANDING_SHADOW_H_PX / 2,
          STANDING_SHADOW_W_PX,
          STANDING_SHADOW_H_PX,
        );
        const sway = Math.sin(progress * Math.PI * 2) * 0.15;
        const bodySwayEffect = sway * 0.5;

        drawPixelRect(LEFT_LEG_X_POS + bodySwayEffect, LEG_Y_POS, LEG_W, LEG_H, baseSkinColor);
        drawPixelRect(RIGHT_LEG_X_POS + sway + bodySwayEffect, LEG_Y_POS, LEG_W, LEG_H, baseSkinColor);
        drawPixelRect(TORSO_X_OFFSET + bodySwayEffect, TORSO_Y_POS, TORSO_W, TORSO_H, baseClothingColor);
        drawPixelRect(LEFT_ARM_X_POS + bodySwayEffect, ARM_Y_POS, ARM_W, ARM_H, baseSkinColor);
        drawPixelRect(RIGHT_ARM_X_POS + bodySwayEffect, ARM_Y_POS, ARM_W, ARM_H, baseSkinColor);
        drawPixelRect(HEAD_X_OFFSET + bodySwayEffect, HEAD_Y_POS, HEAD_W, HEAD_H, baseSkinColor);
        drawPixelRect(HEAD_X_OFFSET + bodySwayEffect, HEAD_Y_POS, HEAD_W, HAIR_TOP_H, baseHairColor);
        break;
      }
      case 'walk': {
        drawShadow(
          (CHARACTER_STANDING_VIRTUAL_WIDTH - STANDING_SHADOW_W_PX) / 2,
          CHARACTER_STANDING_VIRTUAL_HEIGHT - STANDING_SHADOW_H_PX / 2,
          STANDING_SHADOW_W_PX,
          STANDING_SHADOW_H_PX,
        );
        const angle = progress * Math.PI * 2;
        const legMove = Math.sin(angle) * 0.75; // Adjusted for smaller legs
        const armMove = Math.sin(angle + Math.PI) * 0.5;
        const bodyBob = Math.abs(Math.cos(angle)) * 0.25; // Subtle bob

        const currentLegY = LEG_Y_POS + bodyBob;
        const currentTorsoY = TORSO_Y_POS + bodyBob;
        const currentArmY = ARM_Y_POS + bodyBob;
        const currentHeadY = HEAD_Y_POS + bodyBob;

        drawPixelRect(LEFT_LEG_X_POS + legMove, currentLegY, LEG_W, LEG_H, baseSkinColor);
        drawPixelRect(RIGHT_LEG_X_POS - legMove, currentLegY, LEG_W, LEG_H, baseSkinColor);
        drawPixelRect(TORSO_X_OFFSET, currentTorsoY, TORSO_W, TORSO_H, baseClothingColor);
        drawPixelRect(LEFT_ARM_X_POS + armMove, currentArmY, ARM_W, ARM_H, baseSkinColor);
        drawPixelRect(RIGHT_ARM_X_POS - armMove, currentArmY, ARM_W, ARM_H, baseSkinColor);
        drawPixelRect(HEAD_X_OFFSET, currentHeadY, HEAD_W, HEAD_H, baseSkinColor);
        drawPixelRect(HEAD_X_OFFSET, currentHeadY, HEAD_W, HAIR_TOP_H, baseHairColor);
        break;
      }
      case 'gathering': {
        drawShadow(
          (CHARACTER_STANDING_VIRTUAL_WIDTH - STANDING_SHADOW_W_PX) / 2,
          CHARACTER_STANDING_VIRTUAL_HEIGHT - STANDING_SHADOW_H_PX / 2,
          STANDING_SHADOW_W_PX,
          STANDING_SHADOW_H_PX,
        );
        const kneeBendAmount = 0.5;
        const bodyYOffset = kneeBendAmount * 0.5;

        const currentLegY = LEG_Y_POS + bodyYOffset;
        const currentLegH = LEG_H - kneeBendAmount;
        const currentTorsoY = TORSO_Y_POS + bodyYOffset;
        const currentArmY = ARM_Y_POS + bodyYOffset;
        const currentHeadY = HEAD_Y_POS + bodyYOffset;

        drawPixelRect(LEFT_LEG_X_POS, currentLegY, LEG_W, currentLegH, baseSkinColor);
        drawPixelRect(RIGHT_LEG_X_POS, currentLegY, LEG_W, currentLegH, baseSkinColor);
        drawPixelRect(TORSO_X_OFFSET, currentTorsoY, TORSO_W, TORSO_H, baseClothingColor);

        const reachCycle = (Math.sin(progress * Math.PI * 2) + 1) / 2;
        const armReachExtent = 1.0;

        drawPixelRect(LEFT_ARM_X_POS, currentArmY, ARM_W, ARM_H, baseSkinColor); // Static arm
        drawPixelRect(
          RIGHT_ARM_X_POS,
          currentArmY - 0.1 * reachCycle,
          ARM_W + armReachExtent * reachCycle,
          ARM_H,
          baseSkinColor,
        ); // Reaching arm

        drawPixelRect(HEAD_X_OFFSET, currentHeadY, HEAD_W, HEAD_H, baseSkinColor);
        drawPixelRect(HEAD_X_OFFSET, currentHeadY, HEAD_W, HAIR_TOP_H, baseHairColor);
        break;
      }
      case 'eat': {
        drawShadow(
          (CHARACTER_STANDING_VIRTUAL_WIDTH - STANDING_SHADOW_W_PX) / 2,
          CHARACTER_STANDING_VIRTUAL_HEIGHT - STANDING_SHADOW_H_PX / 2,
          STANDING_SHADOW_W_PX,
          STANDING_SHADOW_H_PX,
        );
        const kneeBendAmount = 0.25;
        const bodyYOffset = kneeBendAmount;

        const currentLegY = LEG_Y_POS + bodyYOffset;
        const currentLegH = LEG_H - kneeBendAmount;
        const currentTorsoY = TORSO_Y_POS + bodyYOffset;
        const currentArmY = ARM_Y_POS + bodyYOffset;
        const currentHeadY = HEAD_Y_POS + bodyYOffset;

        drawPixelRect(LEFT_LEG_X_POS, currentLegY, LEG_W, currentLegH, baseSkinColor);
        drawPixelRect(RIGHT_LEG_X_POS, currentLegY, LEG_W, currentLegH, baseSkinColor);
        drawPixelRect(TORSO_X_OFFSET, currentTorsoY, TORSO_W, TORSO_H, baseClothingColor);

        const eatAnimProgress = (Math.sin(progress * Math.PI * 2 * 2) + 1) / 2; // Faster eating anim

        const foodHandTargetX = HEAD_X_OFFSET + HEAD_W / 2 - 0.5;
        const foodHandTargetY = HEAD_Y_POS + HEAD_H / 3;

        const armOriginX = RIGHT_ARM_X_POS + ARM_W / 2;
        const armOriginY = currentArmY + ARM_H / 2;

        const currentHandX = armOriginX - (armOriginX - foodHandTargetX) * eatAnimProgress;
        const currentHandY = armOriginY - (armOriginY - foodHandTargetY) * eatAnimProgress;

        drawPixelRect(LEFT_ARM_X_POS, currentArmY, ARM_W, ARM_H, baseSkinColor); // Static arm
        drawPixelRect(currentHandX - ARM_W / 2, currentHandY - ARM_H / 2, ARM_W, ARM_H * 0.8, baseSkinColor); // Eating Arm
        drawPixelRect(currentHandX - 0.5, currentHandY - 0.75, 1, 0.75, foodColor); // Food item slightly above hand center

        drawPixelRect(HEAD_X_OFFSET, currentHeadY, HEAD_W, HEAD_H, baseSkinColor);
        drawPixelRect(HEAD_X_OFFSET, currentHeadY, HEAD_W, HAIR_TOP_H, baseHairColor);
        break;
      }
      case 'procreate': {
        const procreateShadowWidthPx = STANDING_SHADOW_W_PX + 1;
        drawShadow(
          (CHARACTER_STANDING_VIRTUAL_WIDTH - procreateShadowWidthPx) / 2,
          CHARACTER_STANDING_VIRTUAL_HEIGHT - STANDING_SHADOW_H_PX / 2,
          procreateShadowWidthPx,
          STANDING_SHADOW_H_PX,
        );

        const thrust = (Math.sin(progress * Math.PI * 4) * 0.5 + 0.5) * 0.3; // Reduced thrust intensity
        const kneeBendAmount = 0.75;
        const bodyYOffset = kneeBendAmount * 0.5;

        const currentLegY = LEG_Y_POS + bodyYOffset;
        const currentLegH = LEG_H - kneeBendAmount;
        const procreateLeftLegX = LEFT_LEG_X_POS - 0.25;
        const procreateRightLegX = RIGHT_LEG_X_POS + 0.25;

        drawPixelRect(procreateLeftLegX, currentLegY, LEG_W, currentLegH, baseSkinColor);
        drawPixelRect(procreateRightLegX, currentLegY, LEG_W, currentLegH, baseSkinColor);

        const torsoThrustX = thrust * 0.2;
        const torsoThrustY = -thrust * 0.3;
        const currentTorsoY = TORSO_Y_POS + bodyYOffset + torsoThrustY;
        const currentHeadY = HEAD_Y_POS + bodyYOffset - thrust * 0.15 + torsoThrustY;

        drawPixelRect(TORSO_X_OFFSET + torsoThrustX, currentTorsoY, TORSO_W, TORSO_H, baseClothingColor);
        // Arms slightly splayed during procreate
        drawPixelRect(
          LEFT_ARM_X_POS - 0.2 + torsoThrustX * 0.5,
          ARM_Y_POS + bodyYOffset + 0.25,
          ARM_W,
          ARM_H - 0.5,
          baseSkinColor,
        );
        drawPixelRect(
          RIGHT_ARM_X_POS + 0.2 + torsoThrustX * 0.5,
          ARM_Y_POS + bodyYOffset + 0.25,
          ARM_W,
          ARM_H - 0.5,
          baseSkinColor,
        );

        drawPixelRect(HEAD_X_OFFSET + torsoThrustX, currentHeadY, HEAD_W, HEAD_H, baseSkinColor);
        drawPixelRect(HEAD_X_OFFSET + torsoThrustX, currentHeadY, HEAD_W, HAIR_TOP_H, baseHairColor);
        break;
      }
      case 'dead': {
        // Dead shadow is wider, reflecting character lying down
        const deadShadowW = charPixelDimX * 0.7;
        const deadShadowH = STANDING_SHADOW_H_PX * 0.8;
        drawShadow(
          (charPixelDimX - deadShadowW) / 2,
          charPixelDimY - deadShadowH * 0.7, // Shadow slightly under the body
          deadShadowW,
          deadShadowH,
        );

        const skeletonProgress = Math.max(0, Math.min(1, (progress - 0.2) / 0.8)); // Decay starts sooner, lasts longer

        const currentSkinColor = skeletonProgress > 0.15 ? boneColor : baseSkinColor;
        const currentClothingColor = skeletonProgress > 0.4 ? boneColor : baseClothingColor;
        const currentHairColor = skeletonProgress > 0.7 ? 'transparent' : baseHairColor;

        const bodyCenterY = charPixelDimY / 2; // Center of the character's thickness on ground

        // Parts are laid out along the new X axis (which is charPixelDimX = old CHARACTER_STANDING_VIRTUAL_HEIGHT)
        // HEAD: Length on ground = original HEAD_W, Thickness on ground = original HEAD_H
        const deadHeadX = 0;
        drawPixelRect(deadHeadX, bodyCenterY - HEAD_H / 2, HEAD_W, HEAD_H, currentSkinColor);
        if (currentHairColor !== 'transparent') {
          drawPixelRect(deadHeadX, bodyCenterY - HEAD_H / 2, HEAD_W, HAIR_TOP_H, currentHairColor);
        }

        // TORSO: Length on ground = original TORSO_H, Thickness on ground = original TORSO_W
        const deadTorsoX = deadHeadX + HEAD_W;
        drawPixelRect(deadTorsoX, bodyCenterY - TORSO_W / 2, TORSO_H, TORSO_W, currentClothingColor);

        const limbThickness = LEG_W; // Use LEG_W for consistent limb thickness
        // ARMS: Length on ground = original ARM_H, Thickness = ARM_W
        drawPixelRect(
          deadTorsoX + 0.25,
          bodyCenterY - TORSO_W / 2 - limbThickness + 0.2,
          ARM_H * 0.8,
          limbThickness,
          currentSkinColor,
        ); // Upper arm
        drawPixelRect(deadTorsoX + 0.25, bodyCenterY + TORSO_W / 2 - 0.2, ARM_H * 0.8, limbThickness, currentSkinColor); // Lower arm

        // LEGS: Length on ground = original LEG_H, Thickness = LEG_W
        const deadLegsX = deadTorsoX + TORSO_H;
        drawPixelRect(deadLegsX, bodyCenterY - limbThickness * 1.2, LEG_H * 0.9, limbThickness, currentSkinColor); // Upper leg
        drawPixelRect(deadLegsX, bodyCenterY + limbThickness * 0.2, LEG_H * 0.9, limbThickness, currentSkinColor); // Lower leg

        if (skeletonProgress > 0.5 && currentClothingColor === boneColor) {
          const ribColor = 'rgba(0,0,0,0.3)';
          const numRibs = 2; // Fewer ribs for smaller torso
          for (let i = 0; i < numRibs; i++) {
            drawPixelRect(
              deadTorsoX + TORSO_H * 0.25 + i * ((TORSO_H * 0.4) / numRibs),
              bodyCenterY - TORSO_W / 2,
              limbThickness * 0.4,
              TORSO_W,
              ribColor,
            );
          }
        }
        break;
      }
      default:
        drawPixelRect(0, 0, charPixelDimX, charPixelDimY, 'magenta');
    }

    ctx.restore();
  },
};

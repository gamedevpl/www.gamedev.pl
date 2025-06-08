import { Asset } from '../../../generator-core/src/assets-types';

// Adjusted Sensible Soccer-style proportions and constants
const SS_HEAD_W = 2.0;
const SS_HEAD_H = 1.2;
const SS_HAIR_TOP_H = 0.6; // Portion of SS_HEAD_H that is hair on top

const SS_TORSO_W_BASE = 1.8;
const SS_TORSO_H = 1.5;

const SS_ARM_W_BASE = 0.6;
const SS_ARM_H = 1.4;

const SS_LEG_W_BASE = 0.7;
const SS_LEG_H = 1.3;

const MALE_PANTS_H = 0.6; // Height of the pants/loincloth for males
const FEMALE_TOP_H_ADJUST = 0.1; // Females might have slightly longer looking tops

const SS_CHARACTER_VIRTUAL_WIDTH = 3.0;
const SS_CHARACTER_VIRTUAL_HEIGHT = SS_HEAD_H + SS_TORSO_H + SS_LEG_H; // 1.2 + 1.5 + 1.3 = 4.0

const SS_HEAD_Y_OFFSET = 0;
const SS_TORSO_Y_OFFSET = SS_HEAD_Y_OFFSET + SS_HEAD_H;
const SS_ARM_Y_OFFSET = SS_TORSO_Y_OFFSET + 0.1;
const SS_LEG_Y_OFFSET = SS_TORSO_Y_OFFSET + SS_TORSO_H;

const SHADOW_COLOR = 'rgba(0, 0, 0, 0.45)';
const SS_SHADOW_RADIUS_X = 1.2;
const SS_SHADOW_RADIUS_Y = 0.35;
const SS_SHADOW_OFFSET_X = 0.5;
const SS_SHADOW_OFFSET_Y = 0.1;

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

# Rendering parameters

- age: The age of the character, which affects the size and proportions of the body parts. Age is a number between 1 and 60, with 20 being the average age.
- gender: 
  - The male characters should have only pants, while female cover their breasts with a top. The clothing should be simple and muted, reflecting a stone-age style.
  - Female characters should have long hair, while male should have short hair and beard.
  - Male characters should have a more robust, muscular build
  - Female characters should have thinner arms and legs, with a more pronounced waist and hips.
- isPregnant: (applicable only for females) Indicates if the character is pregnant, like significatly bigger belly, and more pronounced breasts. Pregnant characters should have a larger torso and slightly larger arms and legs to reflect the pregnancy.
- direction: A vector indicating the character's facing direction. There should be at least 8 directions (like in Sensible Soccer): top left, top, top right, left, right, bottom left, bottom, bottom right. The character should be flipped horizontally if the direction vector's X component is negative.
             When moving up(Y < 0), the character back of the head should be visible, when moving down(Y > 0), the character face should be visible.
- hungryLevel: A number between 0 and 100 indicating how hungry the character is, hunger level 100 means the character is starving, 0 means the character is not hungry at all. So hungry characters should be thinner, with less body fat, and more pronounced muscles. The character's hunger level affects the size and proportions of the body parts, with hungrier characters being smaller and more gaunt.

# Rendering details

- All parts of the body must be connected
- Rendering must take into account direction vector (X and Y) to flip the character horizontally if needed
- The character's age affects the size and proportions of the body parts, with older characters being larger and more robust

# Stances

- 'idle': The character stands still, with a slight leg sway to indicate life.
- 'walk': The character moves forward, with legs and arms in motion.
- 'gathering': The character is gathering food from berry bushes, with arms reaching out and a slight bend at the knees.
- 'eat': The character holds food and brings it to their mouth, with a slight bend at the knees.
- 'procreate': The character performs a mating animation, with a specific pose and movement. There should be some additional visual effects to indicate this action, such as a slight glow or aura around the characters, or dust particles to indicate movement.
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
    isPregnant: boolean = false,
    hungryLevel: number = 0,
  ) {
    const directionX = direction[0];
    const directionY = direction[1];

    const padRatio = 0.15;
    const actualX = x + width * padRatio;
    const actualY = y + height * padRatio;
    const actualWidth = width * (1 - 2 * padRatio);
    const actualHeight = height * (1 - 2 * padRatio);

    let charPixelDimX = SS_CHARACTER_VIRTUAL_WIDTH;
    let charPixelDimY = SS_CHARACTER_VIRTUAL_HEIGHT;

    if (stance === 'dead') {
      charPixelDimX = SS_CHARACTER_VIRTUAL_HEIGHT;
      charPixelDimY = SS_TORSO_W_BASE + 0.5;
    }

    const unit = Math.min(actualWidth / charPixelDimX, actualHeight / charPixelDimY);

    const ageMin = 1;
    const ageMax = 60;
    const minScale = 0.7;
    const maxScale = 1.0;
    const ageClamped = Math.max(ageMin, Math.min(age, ageMax));
    const ageScaleFactor = minScale + ((ageClamped - ageMin) / (ageMax - ageMin)) * (maxScale - minScale);
    const scaledUnit = unit * ageScaleFactor;

    const charRenderWidth = charPixelDimX * scaledUnit;
    const charRenderHeight = charPixelDimY * scaledUnit;

    const startDrawX = actualX + (actualWidth - charRenderWidth) / 2;
    const baseStartDrawY = actualY + (actualHeight - charRenderHeight);
    const deadStartDrawY = actualY + (actualHeight - charRenderHeight) / 2;
    const currentStartDrawY = stance === 'dead' ? deadStartDrawY : baseStartDrawY;

    ctx.save();

    const flip = directionX < 0;
    if (flip) {
      ctx.translate(startDrawX + charRenderWidth, currentStartDrawY);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(startDrawX, currentStartDrawY);
    }

    const skinColor = gender === 'female' ? '#E8B97C' : '#D09A5A';
    const hairColor = '#281808';
    const malePantsColor = '#7F5C4A';
    const femaleTopColor = '#6B4F3A'; // Slightly different brown for female top
    const boneColor = '#E0D8C0';
    const foodColor = '#A0522D';

    const hungerFactor = 1.0 - (Math.max(0, Math.min(100, hungryLevel)) / 100) * 0.3;
    const maleBuildFactor = gender === 'male' ? 1.05 : 1.0; // Males slightly more robust

    const currentTorsoW = SS_TORSO_W_BASE * hungerFactor * maleBuildFactor;
    const currentArmW = SS_ARM_W_BASE * hungerFactor * maleBuildFactor;
    const currentLegW = SS_LEG_W_BASE * hungerFactor; // Legs less affected by maleBuildFactor for SS look
    const currentHeadW = SS_HEAD_W;

    const currentHeadX = (SS_CHARACTER_VIRTUAL_WIDTH - currentHeadW) / 2;
    const currentTorsoX = (SS_CHARACTER_VIRTUAL_WIDTH - currentTorsoW) / 2;
    const currentLeftArmX = currentTorsoX - currentArmW * 0.5;
    const currentRightArmX = currentTorsoX + currentTorsoW - currentArmW * 0.5;
    const currentLeftLegX = currentTorsoX + currentTorsoW * 0.5 - currentLegW - 0.05; // Legs closer together
    const currentRightLegX = currentTorsoX + currentTorsoW * 0.5 + 0.05;

    const drawPixelRect = (px: number, py: number, pw: number, ph: number, color: string) => {
      if (color === 'transparent' || pw <= 0 || ph <= 0) return;
      ctx.fillStyle = color;
      const xPos = Math.floor(px * scaledUnit);
      const yPos = Math.floor(py * scaledUnit);
      const rectWidth = Math.max(1, Math.floor(pw * scaledUnit));
      const rectHeight = Math.max(1, Math.floor(ph * scaledUnit));
      ctx.fillRect(xPos, yPos, rectWidth, rectHeight);
    };

    const drawShadow = (charFeetY: number, shadowRadiusX: number, shadowRadiusY: number) => {
      ctx.fillStyle = SHADOW_COLOR;
      ctx.beginPath();
      const shadowCenterX = SS_CHARACTER_VIRTUAL_WIDTH / 2 + (flip ? -SS_SHADOW_OFFSET_X : SS_SHADOW_OFFSET_X);
      const shadowCenterY = charFeetY + SS_SHADOW_OFFSET_Y + shadowRadiusY;
      ctx.ellipse(
        Math.floor(shadowCenterX * scaledUnit),
        Math.floor(shadowCenterY * scaledUnit),
        Math.max(1, Math.floor(shadowRadiusX * scaledUnit)),
        Math.max(1, Math.floor(shadowRadiusY * scaledUnit)),
        0,
        0,
        2 * Math.PI,
      );
      ctx.fill();
    };

    const showBackOfHead = directionY < -0.2 && Math.abs(directionX) < 0.7; // Prioritize back view if moving mostly up

    const drawHair = (
      hx: number,
      hy: number,
      hw: number,
      hh: number,
      gender: 'male' | 'female',
      isBackView: boolean,
    ) => {
      if (isBackView) {
        drawPixelRect(hx, hy, hw, hh, hairColor); // Full hair for back view
        if (gender === 'female') {
          // Simple block for long hair from back view
          drawPixelRect(hx, hy + hh, hw, hh * 0.5, hairColor);
        }
      } else {
        drawPixelRect(hx, hy, hw, SS_HAIR_TOP_H, hairColor); // Basic top hair
        if (gender === 'female') {
          drawPixelRect(hx - 0.15, hy + SS_HAIR_TOP_H * 0.7, hw * 0.3, hh * 1.2, hairColor); // Left long part
          drawPixelRect(hx + hw * 0.85, hy + SS_HAIR_TOP_H * 0.7, hw * 0.3, hh * 1.2, hairColor); // Right long part
        }
        if (gender === 'male') {
          // Beard for front/side view
          drawPixelRect(hx + hw * 0.25, hy + hh * 0.6, hw * 0.5, hh * 0.4, hairColor);
        }
      }
    };

    let effectiveTorsoW = currentTorsoW;
    let effectiveTorsoX = currentTorsoX;
    let torsoColor = skinColor;
    let pantsColor = 'transparent';

    if (gender === 'female') {
      torsoColor = femaleTopColor;
      if (isPregnant) {
        effectiveTorsoW = currentTorsoW * 1.3;
        effectiveTorsoX = (SS_CHARACTER_VIRTUAL_WIDTH - effectiveTorsoW) / 2;
      }
    } else {
      pantsColor = malePantsColor;
    }

    // Common body part Y positions
    let headYPos = SS_HEAD_Y_OFFSET;
    let torsoYPos = SS_TORSO_Y_OFFSET;
    let armYPos = SS_ARM_Y_OFFSET;
    let legYPos = SS_LEG_Y_OFFSET;

    switch (stance) {
      case 'idle': {
        drawShadow(SS_LEG_Y_OFFSET + SS_LEG_H, SS_SHADOW_RADIUS_X, SS_SHADOW_RADIUS_Y);
        const idleCycle = progress * Math.PI * 2;
        const legSwayAmount = 0.1;
        const rightLegSway = Math.sin(idleCycle) * legSwayAmount;
        const leftLegSway = Math.sin(idleCycle + Math.PI) * legSwayAmount;
        // Removed bodyBob as per description to emphasize leg sway

        // Y positions remain static relative to baseStartDrawY for idle

        drawPixelRect(currentLeftLegX + leftLegSway, legYPos, currentLegW, SS_LEG_H, skinColor);
        drawPixelRect(currentRightLegX + rightLegSway, legYPos, currentLegW, SS_LEG_H, skinColor);

        if (gender === 'male') {
          drawPixelRect(
            effectiveTorsoX,
            torsoYPos + SS_TORSO_H - MALE_PANTS_H,
            effectiveTorsoW,
            MALE_PANTS_H,
            pantsColor,
          );
          drawPixelRect(effectiveTorsoX, torsoYPos, effectiveTorsoW, SS_TORSO_H - MALE_PANTS_H, torsoColor); // Skin for upper torso
        } else {
          drawPixelRect(effectiveTorsoX, torsoYPos, effectiveTorsoW, SS_TORSO_H + FEMALE_TOP_H_ADJUST, torsoColor); // Female top
        }

        drawPixelRect(currentLeftArmX + leftLegSway * 0.2, armYPos, currentArmW, SS_ARM_H, skinColor);
        drawPixelRect(currentRightArmX + rightLegSway * 0.2, armYPos, currentArmW, SS_ARM_H, skinColor);

        if (!showBackOfHead) drawPixelRect(currentHeadX, headYPos, currentHeadW, SS_HEAD_H, skinColor);
        drawHair(currentHeadX, headYPos, currentHeadW, SS_HEAD_H, gender, showBackOfHead);
        break;
      }
      case 'walk': {
        drawShadow(SS_LEG_Y_OFFSET + SS_LEG_H, SS_SHADOW_RADIUS_X, SS_SHADOW_RADIUS_Y);
        const angle = progress * Math.PI * 2;
        const legMove = Math.sin(angle) * 0.4; // More pronounced SS style leg move
        const armMove = Math.sin(angle + Math.PI) * 0.3;
        const bodyBob = Math.abs(Math.cos(angle)) * 0.15;

        headYPos += bodyBob;
        torsoYPos += bodyBob;
        armYPos += bodyBob;
        legYPos += bodyBob;

        drawPixelRect(currentLeftLegX + legMove, legYPos, currentLegW, SS_LEG_H, skinColor);
        drawPixelRect(currentRightLegX - legMove, legYPos, currentLegW, SS_LEG_H, skinColor);

        if (gender === 'male') {
          drawPixelRect(
            effectiveTorsoX,
            torsoYPos + SS_TORSO_H - MALE_PANTS_H,
            effectiveTorsoW,
            MALE_PANTS_H,
            pantsColor,
          );
          drawPixelRect(effectiveTorsoX, torsoYPos, effectiveTorsoW, SS_TORSO_H - MALE_PANTS_H, skinColor);
        } else {
          drawPixelRect(effectiveTorsoX, torsoYPos, effectiveTorsoW, SS_TORSO_H + FEMALE_TOP_H_ADJUST, torsoColor);
        }

        drawPixelRect(currentLeftArmX + armMove, armYPos, currentArmW, SS_ARM_H, skinColor);
        drawPixelRect(currentRightArmX - armMove, armYPos, currentArmW, SS_ARM_H, skinColor);

        if (!showBackOfHead) drawPixelRect(currentHeadX, headYPos, currentHeadW, SS_HEAD_H, skinColor);
        drawHair(currentHeadX, headYPos, currentHeadW, SS_HEAD_H, gender, showBackOfHead);
        break;
      }
      case 'gathering': {
        drawShadow(SS_LEG_Y_OFFSET + SS_LEG_H, SS_SHADOW_RADIUS_X * 1.1, SS_SHADOW_RADIUS_Y);
        const kneeBendAmount = 0.2;
        const bodyYOffset = kneeBendAmount * 0.5;
        const legH = SS_LEG_H - kneeBendAmount;

        headYPos += bodyYOffset;
        torsoYPos += bodyYOffset;
        armYPos += bodyYOffset;
        legYPos += bodyYOffset + kneeBendAmount;

        drawPixelRect(currentLeftLegX, legYPos, currentLegW, legH, skinColor);
        drawPixelRect(currentRightLegX, legYPos, currentLegW, legH, skinColor);

        if (gender === 'male') {
          drawPixelRect(
            effectiveTorsoX,
            torsoYPos + SS_TORSO_H - MALE_PANTS_H,
            effectiveTorsoW,
            MALE_PANTS_H,
            pantsColor,
          );
          drawPixelRect(effectiveTorsoX, torsoYPos, effectiveTorsoW, SS_TORSO_H - MALE_PANTS_H, skinColor);
        } else {
          drawPixelRect(effectiveTorsoX, torsoYPos, effectiveTorsoW, SS_TORSO_H + FEMALE_TOP_H_ADJUST, torsoColor);
        }

        const reachCycle = (Math.sin(progress * Math.PI * 2) + 1) / 2;
        const armReachExtent = 0.6;
        const armOffsetY = -0.2 * reachCycle;
        drawPixelRect(
          currentLeftArmX - armReachExtent * reachCycle * 0.4,
          armYPos + armOffsetY,
          currentArmW + armReachExtent * reachCycle * 0.4,
          SS_ARM_H,
          skinColor,
        );
        drawPixelRect(
          currentRightArmX + armReachExtent * reachCycle * 0.2,
          armYPos + armOffsetY,
          currentArmW + armReachExtent * reachCycle * 0.6,
          SS_ARM_H,
          skinColor,
        );

        if (!showBackOfHead) drawPixelRect(currentHeadX, headYPos, currentHeadW, SS_HEAD_H, skinColor);
        drawHair(currentHeadX, headYPos, currentHeadW, SS_HEAD_H, gender, showBackOfHead);
        break;
      }
      case 'eat': {
        drawShadow(SS_LEG_Y_OFFSET + SS_LEG_H, SS_SHADOW_RADIUS_X, SS_SHADOW_RADIUS_Y);
        const kneeBendAmount = 0.1;
        const bodyYOffset = kneeBendAmount;
        const legH = SS_LEG_H - kneeBendAmount;

        headYPos += bodyYOffset;
        torsoYPos += bodyYOffset;
        armYPos += bodyYOffset;
        legYPos += bodyYOffset + kneeBendAmount;

        drawPixelRect(currentLeftLegX, legYPos, currentLegW, legH, skinColor);
        drawPixelRect(currentRightLegX, legYPos, currentLegW, legH, skinColor);

        if (gender === 'male') {
          drawPixelRect(
            effectiveTorsoX,
            torsoYPos + SS_TORSO_H - MALE_PANTS_H,
            effectiveTorsoW,
            MALE_PANTS_H,
            pantsColor,
          );
          drawPixelRect(effectiveTorsoX, torsoYPos, effectiveTorsoW, SS_TORSO_H - MALE_PANTS_H, skinColor);
        } else {
          drawPixelRect(effectiveTorsoX, torsoYPos, effectiveTorsoW, SS_TORSO_H + FEMALE_TOP_H_ADJUST, torsoColor);
        }

        const eatAnimProgress = (Math.sin(progress * Math.PI * 4) + 1) / 2;
        const foodHandTargetX = currentHeadX + currentHeadW / 2 - currentArmW / 2;
        const foodHandTargetY = headYPos + SS_HEAD_H / 2.5;
        const armOriginX = currentRightArmX + currentArmW / 2;
        const armOriginY = armYPos + SS_ARM_H / 2;
        const currentHandX = armOriginX - (armOriginX - foodHandTargetX) * eatAnimProgress;
        const currentHandY = armOriginY - (armOriginY - foodHandTargetY) * eatAnimProgress;

        drawPixelRect(currentLeftArmX, armYPos, currentArmW, SS_ARM_H, skinColor); // Static left arm
        drawPixelRect(
          currentHandX - currentArmW / 2,
          currentHandY - SS_ARM_H / 2,
          currentArmW,
          SS_ARM_H * 0.9,
          skinColor,
        ); // Right arm bringing food
        drawPixelRect(currentHandX - 0.2, currentHandY - 0.4, 0.4, 0.4, foodColor); // Food item

        if (!showBackOfHead) drawPixelRect(currentHeadX, headYPos, currentHeadW, SS_HEAD_H, skinColor);
        drawHair(currentHeadX, headYPos, currentHeadW, SS_HEAD_H, gender, showBackOfHead);
        break;
      }
      case 'procreate': {
        drawShadow(SS_LEG_Y_OFFSET + SS_LEG_H, SS_SHADOW_RADIUS_X * 1.2, SS_SHADOW_RADIUS_Y);
        const thrust = (Math.sin(progress * Math.PI * 4) * 0.5 + 0.5) * 0.15; // Subtle thrust
        const kneeBendAmount = 0.3;
        const bodyYOffset = kneeBendAmount * 0.5;
        const legH = SS_LEG_H - kneeBendAmount;

        headYPos += bodyYOffset - thrust * 0.4;
        torsoYPos += bodyYOffset - thrust * 0.2;
        armYPos += bodyYOffset - thrust * 0.1;
        legYPos += bodyYOffset + kneeBendAmount;

        const torsoDrawX = currentTorsoX + thrust * 0.1;
        const headDrawX = currentHeadX + thrust * 0.1;

        drawPixelRect(currentLeftLegX - 0.05, legYPos, currentLegW, legH, skinColor);
        drawPixelRect(currentRightLegX + 0.05, legYPos, currentLegW, legH, skinColor);

        if (gender === 'male') {
          drawPixelRect(torsoDrawX, torsoYPos + SS_TORSO_H - MALE_PANTS_H, effectiveTorsoW, MALE_PANTS_H, pantsColor);
          drawPixelRect(torsoDrawX, torsoYPos, effectiveTorsoW, SS_TORSO_H - MALE_PANTS_H, skinColor);
        } else {
          // Pregnant female torso already handled by effectiveTorsoW/X
          drawPixelRect(
            effectiveTorsoX + thrust * 0.1,
            torsoYPos,
            effectiveTorsoW,
            SS_TORSO_H + FEMALE_TOP_H_ADJUST,
            torsoColor,
          );
        }

        drawPixelRect(currentLeftArmX - 0.05 + thrust * 0.05, armYPos, currentArmW, SS_ARM_H, skinColor);
        drawPixelRect(currentRightArmX + 0.05 + thrust * 0.05, armYPos, currentArmW, SS_ARM_H, skinColor);

        // Ensure no color flashing or lines by using standard skin/hair drawing
        if (!showBackOfHead) drawPixelRect(headDrawX, headYPos, currentHeadW, SS_HEAD_H, skinColor);
        drawHair(headDrawX, headYPos, currentHeadW, SS_HEAD_H, gender, showBackOfHead);
        break;
      }
      case 'dead': {
        const deadShadowRadiusX = charPixelDimX * 0.3;
        const deadShadowRadiusY = SS_SHADOW_RADIUS_Y * 0.6;
        drawShadow(charPixelDimY - deadShadowRadiusY * 1.5, deadShadowRadiusX, deadShadowRadiusY);

        const skeletonProgress = Math.max(0, Math.min(1, (progress - 0.1) / 0.9));
        const dSkin = skeletonProgress > 0.2 ? boneColor : skinColor;
        const dClothMale = skeletonProgress > 0.5 ? boneColor : malePantsColor; // Changed to const
        const dClothFemale = skeletonProgress > 0.5 ? boneColor : femaleTopColor; // Changed to const
        const dHair = skeletonProgress > 0.75 ? 'transparent' : hairColor;

        const bodyCenterY = charPixelDimY / 2;
        const deadHeadW = SS_HEAD_H;
        const deadHeadH = SS_HEAD_W;
        const deadHeadX = 0;
        drawPixelRect(deadHeadX, bodyCenterY - deadHeadH / 2, deadHeadW, deadHeadH, dSkin);
        if (dHair !== 'transparent') {
          drawPixelRect(
            deadHeadX,
            bodyCenterY - deadHeadH / 2,
            deadHeadW,
            SS_HAIR_TOP_H * (deadHeadH / SS_HEAD_H),
            dHair,
          );
        }

        const deadTorsoL = SS_TORSO_H;
        const deadTorsoT = currentTorsoW * 0.8; // Torso thickness when dead
        const deadTorsoX = deadHeadW;

        if (gender === 'male') {
          drawPixelRect(
            deadTorsoX,
            bodyCenterY - deadTorsoT / 2 + deadTorsoT * (1 - MALE_PANTS_H / SS_TORSO_H),
            deadTorsoL,
            deadTorsoT * (MALE_PANTS_H / SS_TORSO_H),
            dClothMale,
          );
          drawPixelRect(
            deadTorsoX,
            bodyCenterY - deadTorsoT / 2,
            deadTorsoL,
            deadTorsoT * (1 - MALE_PANTS_H / SS_TORSO_H),
            dSkin,
          ); // Skin part for male
        } else {
          drawPixelRect(deadTorsoX, bodyCenterY - deadTorsoT / 2, deadTorsoL, deadTorsoT, dClothFemale);
        }

        const deadArmL = SS_ARM_H;
        const deadArmT = currentArmW * 0.8;
        drawPixelRect(
          deadTorsoX + deadTorsoL * 0.1,
          bodyCenterY - deadTorsoT / 2 - deadArmT * 0.8,
          deadArmL * 0.9,
          deadArmT,
          dSkin,
        ); // Upper arm splayed
        drawPixelRect(
          deadTorsoX + deadTorsoL * 0.15,
          bodyCenterY + deadTorsoT / 2 - deadArmT * 0.2,
          deadArmL * 0.9,
          deadArmT,
          dSkin,
        ); // Lower arm splayed

        const deadLegL = SS_LEG_H;
        const deadLegT = currentLegW * 0.8;
        const deadLegsX = deadTorsoX + deadTorsoL;
        drawPixelRect(deadLegsX, bodyCenterY - deadLegT * 1.2, deadLegL, deadLegT, dSkin);
        drawPixelRect(deadLegsX, bodyCenterY + deadLegT * 0.2, deadLegL, deadLegT, dSkin);

        if (skeletonProgress > 0.6 && (dClothMale === boneColor || dClothFemale === boneColor)) {
          const ribColor = '#555555'; // Dark grey for pixel rib detail
          const ribWidth = 0.2; // Virtual width for a thin rib line
          for (let i = 0; i < 2; i++) {
            drawPixelRect(
              deadTorsoX + deadTorsoL * 0.3 + i * (deadTorsoL * 0.25),
              bodyCenterY - deadTorsoT / 2,
              ribWidth,
              deadTorsoT,
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

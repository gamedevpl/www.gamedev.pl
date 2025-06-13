import { Asset } from '../../../generator-core/src/assets-types';

// Helper to draw a pixel-perfect rectangle, crucial for the retro aesthetic.
const drawPixelRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  scale: number,
) => {
  if (color === 'transparent' || w <= 0 || h <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(
    Math.floor(x * scale),
    Math.floor(y * scale),
    Math.max(1, Math.floor(w * scale)),
    Math.max(1, Math.floor(h * scale)),
  );
};

// Sensible Soccer-inspired constants for character proportions
const V_WIDTH = 4.0;
const V_HEIGHT = 4.0;
const HEAD_W = 2.4;
const HEAD_H = 1.4;
const HAIR_H = 0.75;
const TORSO_W_BASE = 1.8;
const TORSO_H = 1.4;
const ARM_W_BASE = 0.7;
const ARM_H = 1.3;
const LEG_W_BASE = 0.75;
const LEG_H = 1.2;
const MALE_PANTS_H = 0.7;

const HEAD_Y = 0;
const TORSO_Y = HEAD_Y + HEAD_H;
const ARM_Y = TORSO_Y + 0.1;
const LEG_Y = TORSO_Y + TORSO_H;

// Shadow constants
const SHADOW_COLOR = 'rgba(0, 0, 0, 0.5)';
const SHADOW_RADIUS_X = 1.4;
const SHADOW_RADIUS_Y = 0.35;
const SHADOW_OFFSET_X = 0.4;
const SHADOW_OFFSET_Y = 0.1;

export const TribeHuman2D: Asset = {
  name: 'tribe-human-2d',
  referenceImage: 'swos.png',
  description: `A 2D human character asset for the Tribe game. This includes ensuring that the unique animations for stances like 'eat' and 'procreate' do not erroneously appear in other stances, such as 'walk', which was observed in the provided rendered media. The 'idle' animation was updated to a leg sway to better match the provided video for that stance, replacing a simpler body bob.

# Visual style

Human characters in the Tribe game are inspired by classic 2D pixel art, they look like Sensible Soccer players(Sensible Soccer game visual style is IMPORTANT), with a simple and recognizable design. The characters are designed to be easily distinguishable and animated in a way that conveys their actions clearly.

Character in Tribe game look like people from stone age, they have simple clothing, no shoes, and no modern accessories. The characters are designed to be easily distinguishable and animated in a way that conveys their actions clearly.

# Technical details

The asset is rendered on a canvas using the CanvasRenderingContext2D API. The rendering function takes parameters for position, size, progress, stance, direction, gender, and age. The character can face left or right, and the rendering adapts based on the stance (e.g., idle, walk, eat, procreate).
The rendering function must be simple and efficient, it should not use complex patterns or gradients, and should focus on solid colors and basic shapes to maintain the pixel art aesthetic.

15% padding from all edges of the rendering box is required to ensure the character is not cut off during rendering.

Subtle shadow should be drawn under the character to give it a sense of depth.

# Rendering parameters

- age: The age of the character, which affects the size and proportions of the body parts. Age is a number between 1 and 60, with 20 being the average age.
- gender: 
  - The male characters should have only pants, while female cover their breasts with a top. The clothing should be simple and muted, reflecting a stone-age style.
  - Female characters should have long hair, while male should have short hair and beard.
  - Male characters should have a more robust, muscular build
  - Female characters should have thinner arms and legs, with a more pronounced waist and hips.
- isPregnant: (applicable only for females) Indicates if the character is pregnant, like very large belly. Pregnant characters should have a larger torso.
- direction: A vector indicating the character's facing direction. There should be at least 8 directions (like in Sensible Soccer): top left, top, top right, left, right, bottom left, bottom, bottom right. The character should be flipped horizontally if the direction vector's X component is negative.
             When moving up(top, top left, top right), the character back of the head should be visible, when moving down(Y > 0), the character face should be visible.
- hungryLevel: A number between 0 and 100 indicating how hungry the character is, hunger level 100 means the character is starving, 0 means the character is not hungry at all. So hungry characters should be thinner, with less body fat, and more pronounced muscles. The character's hunger level affects the size and proportions of the body parts, with hungrier characters being smaller and more gaunt.

# Rendering details

- All parts of the body must be connected
- Rendering must take into account direction vector (X and Y) to flip the character horizontally if needed
- The character's age affects the size and proportions of the body parts, with older characters being larger and more robust. Hair color should become gray for older characters.

# Stances

- 'idle': The character stands still, with a slight leg sway to indicate life.
- 'walk': The character moves forward, with legs and arms in motion.
- 'gathering': The character is gathering food from berry bushes, with arms reaching out and a slight bend at the knees.
- 'eat': The character holds food and brings it to their mouth, with a slight bend at the knees.
- 'procreate': The character performs a mating animation, with a specific pose and movement. There should be some additional visual effects to indicate this action, such as a slight glow or aura around the characters, or dust particles to indicate movement.
- 'attacking': The character performs an attack animation, with arms raised and a forward motion.
- 'defending': The character takes a defensive stance, with arms raised and a slight bend at the knees.
- 'stunned': The character is stunned and laying on the ground, with limbs relaxed and a neutral expression.
- 'dead': The character lies on the ground, with limbs relaxed and a neutral expression, slowly turns into a skeleton over time.

`,
  stances: ['idle', 'walk', 'gathering', 'eat', 'procreate', 'dead', 'attacking', 'defending', 'stunned'],
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
    const isLyingDown = ['dead', 'stunned'].includes(stance);
    const padRatio = 0.15;
    const vWidth = isLyingDown ? V_HEIGHT : V_WIDTH;
    const vHeight = isLyingDown ? V_WIDTH : V_HEIGHT;

    const unit = Math.min((width * (1 - 2 * padRatio)) / vWidth, (height * (1 - 2 * padRatio)) / vHeight);

    const ageScaleFactor = 0.7 + ((Math.max(1, Math.min(age, 60)) - 1) / 59) * 0.3;
    const scaledUnit = unit * ageScaleFactor;

    const renderW = vWidth * scaledUnit;
    const renderH = vHeight * scaledUnit;
    const startX = x + (width - renderW) / 2;
    const startY = y + (height - renderH) / 2;

    ctx.save();
    const flip = direction[0] < 0 && !isLyingDown;
    if (flip) {
      ctx.translate(startX + renderW, startY);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(startX, startY);
    }

    const baseSkinColor = '#D09A5A';
    const hairColor = age > 50 ? '#BDBDBD' : '#281808';
    const malePantsColor = '#7F5C4A';
    const femaleTopColor = '#6B4F3A';
    const boneColor = '#E0D8C0';
    const foodColor = '#A0522D';

    const hungerFactor = 1.0 - (Math.max(0, Math.min(100, hungryLevel)) / 100) * 0.3;
    const genderBuildFactor = gender === 'male' ? 1.05 : 0.95;

    let torsoW = TORSO_W_BASE * hungerFactor * genderBuildFactor;
    let armW = ARM_W_BASE * hungerFactor * genderBuildFactor;
    let legW = LEG_W_BASE * hungerFactor * genderBuildFactor;

    if (isPregnant && gender === 'female') {
      torsoW *= 1.8;
    }

    const torsoX = (V_WIDTH - torsoW) / 2;
    const headX = (V_WIDTH - HEAD_W) / 2;
    const leftArmX = torsoX - armW - 0.1;
    const rightArmX = torsoX + torsoW + 0.1;
    const legStanceWidth = 0.4;
    const leftLegX = torsoX + torsoW * (0.5 - legStanceWidth / 2) - legW;
    const rightLegX = torsoX + torsoW * (0.5 + legStanceWidth / 2);

    const showBackOfHead = direction[1] < -0.2 && Math.abs(direction[0]) < 0.7;

    const drawShadow = (yOff: number, rX: number, rY: number) => {
      ctx.fillStyle = SHADOW_COLOR;
      ctx.beginPath();
      const shadowCenterX = V_WIDTH / 2 + (flip ? -SHADOW_OFFSET_X : SHADOW_OFFSET_X);
      const shadowCenterY = yOff + SHADOW_OFFSET_Y + rY;
      ctx.ellipse(
        Math.floor(shadowCenterX * scaledUnit),
        Math.floor(shadowCenterY * scaledUnit),
        Math.max(1, Math.floor(rX * scaledUnit)),
        Math.max(1, Math.floor(rY * scaledUnit)),
        0,
        0,
        2 * Math.PI,
      );
      ctx.fill();
    };

    const drawBody = (yOff: number, skinColor: string) => {
      if (gender === 'male') {
        drawPixelRect(ctx, torsoX, TORSO_Y + yOff, torsoW, TORSO_H - MALE_PANTS_H, skinColor, scaledUnit);
        drawPixelRect(
          ctx,
          torsoX,
          TORSO_Y + TORSO_H - MALE_PANTS_H + yOff,
          torsoW,
          MALE_PANTS_H,
          malePantsColor,
          scaledUnit,
        );
      } else {
        drawPixelRect(ctx, torsoX, TORSO_Y + yOff, torsoW, TORSO_H + 0.1, femaleTopColor, scaledUnit);
      }
    };

    const drawHeadAndHair = (yOff: number, skinColor: string) => {
      if (showBackOfHead) {
        drawPixelRect(
          ctx,
          headX,
          HEAD_Y + yOff,
          HEAD_W,
          gender === 'female' ? HEAD_H * 1.3 : HEAD_H,
          hairColor,
          scaledUnit,
        );
      } else {
        drawPixelRect(ctx, headX, HEAD_Y + yOff, HEAD_W, HEAD_H, skinColor, scaledUnit);
        drawPixelRect(ctx, headX - HEAD_W * 0.05, HEAD_Y + yOff, HEAD_W * 1.1, HAIR_H, hairColor, scaledUnit);
        if (gender === 'female') {
          const sideHairW = HEAD_W * 0.55;
          const sideHairH = HEAD_H * 1.1;
          drawPixelRect(
            ctx,
            headX - sideHairW * 0.35,
            HEAD_Y + HAIR_H * 0.3 + yOff,
            sideHairW,
            sideHairH,
            hairColor,
            scaledUnit,
          );
          drawPixelRect(
            ctx,
            headX + HEAD_W * 1.1 - sideHairW * 0.65,
            HEAD_Y + HAIR_H * 0.3 + yOff,
            sideHairW,
            sideHairH,
            hairColor,
            scaledUnit,
          );
        } else {
          drawPixelRect(
            ctx,
            headX + HEAD_W * 0.2,
            HEAD_Y + HEAD_H * 0.55 + yOff,
            HEAD_W * 0.6,
            HEAD_H * 0.45,
            hairColor,
            scaledUnit,
          );
        }
      }
    };

    switch (stance) {
      case 'idle': {
        const idleCycle = progress * Math.PI * 2;
        const legSway = Math.sin(idleCycle) * 0.15;
        const bob = (Math.cos(idleCycle * 2) + 1) * 0.05;
        drawShadow(LEG_Y + LEG_H + bob, SHADOW_RADIUS_X, SHADOW_RADIUS_Y);
        drawPixelRect(ctx, leftLegX + legSway, LEG_Y + bob, legW, LEG_H, baseSkinColor, scaledUnit);
        drawPixelRect(ctx, rightLegX - legSway, LEG_Y + bob, legW, LEG_H, baseSkinColor, scaledUnit);
        drawBody(bob, baseSkinColor);
        drawPixelRect(ctx, leftArmX, ARM_Y + bob, armW, ARM_H, baseSkinColor, scaledUnit);
        drawPixelRect(ctx, rightArmX, ARM_Y + bob, armW, ARM_H, baseSkinColor, scaledUnit);
        drawHeadAndHair(bob, baseSkinColor);
        break;
      }
      case 'walk': {
        const angle = progress * Math.PI * 2;
        const move = Math.sin(angle) * 0.45;
        const bob = Math.abs(Math.cos(angle)) * 0.15;
        drawShadow(LEG_Y + LEG_H + bob, SHADOW_RADIUS_X, SHADOW_RADIUS_Y);
        drawPixelRect(ctx, leftLegX + move, LEG_Y + bob, legW, LEG_H, baseSkinColor, scaledUnit);
        drawPixelRect(ctx, rightLegX - move, LEG_Y + bob, legW, LEG_H, baseSkinColor, scaledUnit);
        drawBody(bob, baseSkinColor);
        drawPixelRect(ctx, leftArmX - move, ARM_Y + bob, armW, ARM_H, baseSkinColor, scaledUnit);
        drawPixelRect(ctx, rightArmX + move, ARM_Y + bob, armW, ARM_H, baseSkinColor, scaledUnit);
        drawHeadAndHair(bob, baseSkinColor);
        break;
      }
      case 'gathering': {
        const cycle = progress * Math.PI * 2;
        const kneeBend = 0.2;
        const armReach = ((Math.sin(cycle) + 1) / 2) * 0.5;
        const yOff = kneeBend + Math.abs(Math.cos(cycle)) * 0.05;
        drawShadow(LEG_Y + LEG_H, SHADOW_RADIUS_X, SHADOW_RADIUS_Y);
        drawPixelRect(ctx, leftLegX, LEG_Y + yOff, legW, LEG_H - kneeBend, baseSkinColor, scaledUnit);
        drawPixelRect(ctx, rightLegX, LEG_Y + yOff, legW, LEG_H - kneeBend, baseSkinColor, scaledUnit);
        drawBody(yOff, baseSkinColor);
        drawPixelRect(ctx, leftArmX + 0.3, ARM_Y + yOff - armReach, armW, ARM_H, baseSkinColor, scaledUnit);
        drawPixelRect(ctx, rightArmX - 0.3, ARM_Y + yOff - armReach, armW, ARM_H, baseSkinColor, scaledUnit);
        drawHeadAndHair(yOff, baseSkinColor);
        break;
      }
      case 'eat': {
        const kneeBend = 0.1;
        drawShadow(LEG_Y + LEG_H, SHADOW_RADIUS_X, SHADOW_RADIUS_Y);
        drawPixelRect(ctx, leftLegX, LEG_Y + kneeBend, legW, LEG_H - kneeBend, baseSkinColor, scaledUnit);
        drawPixelRect(ctx, rightLegX, LEG_Y + kneeBend, legW, LEG_H - kneeBend, baseSkinColor, scaledUnit);
        drawBody(kneeBend, baseSkinColor);
        const eatAnim = (Math.sin(progress * Math.PI * 4) + 1) / 2;
        const handTargetX = headX + HEAD_W / 2;
        const handTargetY = HEAD_Y + HEAD_H / 2;
        const handX = rightArmX + (handTargetX - rightArmX) * eatAnim;
        const handY = ARM_Y + kneeBend + (handTargetY - (ARM_Y + kneeBend)) * eatAnim;
        drawPixelRect(ctx, leftArmX, ARM_Y + kneeBend, armW, ARM_H, baseSkinColor, scaledUnit);
        drawPixelRect(ctx, handX, handY, armW, ARM_H, baseSkinColor, scaledUnit);
        drawPixelRect(ctx, handX, handY - 0.4, 0.4, 0.4, foodColor, scaledUnit);
        drawHeadAndHair(kneeBend, baseSkinColor);
        break;
      }
      case 'procreate': {
        const isGlowing = Math.sin(progress * Math.PI * 12) > 0;
        const skinColor = isGlowing ? '#FFDAB9' : baseSkinColor;
        const thrust = (Math.sin(progress * Math.PI * 6) * 0.5 + 0.5) * 0.15;
        const kneeBend = 0.25;
        const yOff = kneeBend - thrust * 0.2;
        drawShadow(LEG_Y + LEG_H, SHADOW_RADIUS_X * 1.1, SHADOW_RADIUS_Y);
        drawPixelRect(ctx, leftLegX, LEG_Y + yOff, legW, LEG_H - kneeBend, skinColor, scaledUnit);
        drawPixelRect(ctx, rightLegX, LEG_Y + yOff, legW, LEG_H - kneeBend, skinColor, scaledUnit);
        drawBody(yOff, skinColor);
        drawPixelRect(ctx, leftArmX, ARM_Y + yOff, armW, ARM_H, skinColor, scaledUnit);
        drawPixelRect(ctx, rightArmX, ARM_Y + yOff, armW, ARM_H, skinColor, scaledUnit);
        drawHeadAndHair(yOff, skinColor);
        const particleCycle = (progress * 15) % 1;
        for (let i = 0; i < 4; i++) {
          const angle = Math.random() * Math.PI * 2;
          const radius = torsoW * 0.4 + Math.random() * 0.8;
          const pX = torsoX + torsoW / 2 + Math.cos(angle) * radius;
          const pY = TORSO_Y + yOff + TORSO_H / 2 + Math.sin(angle) * radius * 0.7;
          const alpha = (0.2 + Math.random() * 0.3) * (1 - particleCycle);
          const pSize = (0.1 + Math.random() * 0.2) * (1 - particleCycle);
          drawPixelRect(ctx, pX, pY, pSize, pSize, `rgba(220, 180, 130, ${alpha.toFixed(2)})`, scaledUnit);
        }
        break;
      }
      case 'attacking': {
        const lunge = Math.sin(progress * Math.PI) * 0.4;
        const yOff = Math.abs(Math.sin(progress * Math.PI)) * 0.1;
        drawShadow(LEG_Y + LEG_H + yOff, SHADOW_RADIUS_X * 1.2, SHADOW_RADIUS_Y);
        drawPixelRect(ctx, leftLegX - lunge, LEG_Y + yOff, legW, LEG_H, baseSkinColor, scaledUnit);
        drawPixelRect(ctx, rightLegX + lunge * 0.5, LEG_Y + yOff, legW, LEG_H, baseSkinColor, scaledUnit);
        drawBody(yOff, baseSkinColor);
        drawPixelRect(ctx, leftArmX, ARM_Y + yOff - 0.4, armW, ARM_H, baseSkinColor, scaledUnit);
        drawPixelRect(ctx, rightArmX, ARM_Y + yOff - 0.6, armW, ARM_H, baseSkinColor, scaledUnit);
        drawHeadAndHair(yOff, baseSkinColor);
        break;
      }
      case 'defending': {
        const crouch = 0.2;
        drawShadow(LEG_Y + LEG_H, SHADOW_RADIUS_X * 1.1, SHADOW_RADIUS_Y);
        drawPixelRect(ctx, leftLegX - 0.1, LEG_Y + crouch, legW, LEG_H - crouch, baseSkinColor, scaledUnit);
        drawPixelRect(ctx, rightLegX + 0.1, LEG_Y + crouch, legW, LEG_H - crouch, baseSkinColor, scaledUnit);
        drawBody(crouch, baseSkinColor);
        drawPixelRect(ctx, leftArmX - 0.2, ARM_Y + crouch - 0.3, armW, ARM_H, baseSkinColor, scaledUnit);
        drawPixelRect(ctx, rightArmX + 0.2, ARM_Y + crouch - 0.3, armW, ARM_H, baseSkinColor, scaledUnit);
        drawHeadAndHair(crouch, baseSkinColor);
        break;
      }
      case 'stunned':
      case 'dead': {
        const isDead = stance === 'dead';
        const decay = isDead ? Math.min(1, progress * 1.2) : 0;
        const skin = decay > 0.2 ? boneColor : baseSkinColor;
        const cloth = decay > 0.5 ? boneColor : gender === 'male' ? malePantsColor : femaleTopColor;
        const hair = decay > 0.8 ? 'transparent' : hairColor;

        const bodyCenterX = V_WIDTH / 2;
        const bodyCenterY = V_HEIGHT / 2 + 0.5;

        ctx.fillStyle = SHADOW_COLOR;
        ctx.beginPath();
        ctx.ellipse(
          Math.floor(bodyCenterX * scaledUnit),
          Math.floor((bodyCenterY + 0.2) * scaledUnit),
          Math.max(1, Math.floor(SHADOW_RADIUS_X * 1.2 * scaledUnit)),
          Math.max(1, Math.floor(SHADOW_RADIUS_Y * 1.5 * scaledUnit)),
          0,
          0,
          2 * Math.PI,
        );
        ctx.fill();

        const splayX = 0.4;
        const splayY = 0.2;
        drawPixelRect(ctx, bodyCenterX - legW - splayX, bodyCenterY, legW, LEG_H, skin, scaledUnit);
        drawPixelRect(ctx, bodyCenterX + splayX, bodyCenterY, legW, LEG_H, skin, scaledUnit);
        drawPixelRect(ctx, bodyCenterX - armW - splayX, bodyCenterY - TORSO_H + splayY, armW, ARM_H, skin, scaledUnit);
        drawPixelRect(ctx, bodyCenterX + splayX, bodyCenterY - TORSO_H + splayY, armW, ARM_H, skin, scaledUnit);

        const tX = bodyCenterX - torsoW / 2;
        const tY = bodyCenterY - TORSO_H / 2;
        if (gender === 'male') {
          drawPixelRect(ctx, tX, tY, torsoW, TORSO_H, cloth, scaledUnit);
          if (decay < 0.5) drawPixelRect(ctx, tX, tY, torsoW, TORSO_H - MALE_PANTS_H, skin, scaledUnit);
        } else {
          drawPixelRect(ctx, tX, tY, torsoW, TORSO_H, cloth, scaledUnit);
        }

        const hX = bodyCenterX - HEAD_W / 2;
        const hY = bodyCenterY - TORSO_H / 2 - HEAD_H + 0.2;
        drawPixelRect(ctx, hX, hY, HEAD_W, HEAD_H, skin, scaledUnit);
        drawPixelRect(ctx, hX - 0.1, hY - 0.1, HEAD_W * 1.1, HAIR_H, hair, scaledUnit);

        if (isDead && decay > 0.6) {
          const ribColor = '#B0A890';
          for (let i = 0; i < 3; i++) {
            drawPixelRect(ctx, tX + 0.2, tY + i * 0.4 + 0.2, torsoW - 0.4, 0.2, ribColor, scaledUnit);
          }
        }
        break;
      }
      default:
        drawPixelRect(ctx, 0, 0, vWidth, vHeight, 'magenta', scaledUnit);
        break;
    }

    ctx.restore();
  },
};

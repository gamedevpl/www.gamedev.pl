import { Asset } from '../../../generator-core/src/assets-types';

// Helper to draw a pixel-perfect rectangle on a virtual grid, crucial for the retro aesthetic.
const drawPixel = (
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
  // Floor all values to ensure sharp, grid-aligned pixels
  ctx.fillRect(Math.floor(x * scale), Math.floor(y * scale), Math.ceil(w * scale), Math.ceil(h * scale));
};

// Sensible Soccer-inspired constants for character proportions on a virtual pixel grid
const V_WIDTH = 10;
const V_HEIGHT = 10;
const HEAD_W = 6;
const HEAD_H = 4;
const HAIR_H = 2;
const TORSO_W_BASE = 5;
const TORSO_H = 4;
const ARM_W_BASE = 2;
const ARM_H = 4;
const LEG_W_BASE = 2;
const LEG_H = 3;
const MALE_PANTS_H = 2;

const HEAD_Y = 0;
const TORSO_Y = HEAD_Y + HEAD_H - 1; // Overlap for connectivity
const ARM_Y = TORSO_Y;
const LEG_Y = TORSO_Y + TORSO_H - 1; // Overlap for connectivity

// Shadow constants
const SHADOW_COLOR = 'rgba(0, 0, 0, 0.4)';
const SHADOW_RADIUS_X = 4;
const SHADOW_RADIUS_Y = 1;

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
    const vGridWidth = isLyingDown ? V_HEIGHT + 4 : V_WIDTH;
    const vGridHeight = isLyingDown ? V_WIDTH + 4 : V_HEIGHT + LEG_H;

    const padRatio = 0.15;
    const scale = Math.min(
      (width * (1 - 2 * padRatio)) / vGridWidth,
      (height * (1 - 2 * padRatio)) / vGridHeight,
    );

    const renderW = vGridWidth * scale;
    const renderH = vGridHeight * scale;
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

    // --- Define Colors and Factors ---
    const baseSkinColor = '#D09A5A';
    const hairColor = age > 50 ? '#BDBDBD' : '#281808';
    const malePantsColor = '#7F5C4A';
    const femaleTopColor = '#6B4F3A';
    const boneColor = '#E0D8C0';
    const foodColor = '#A0522D';

    const hungerFactor = 1.0 - (Math.max(0, Math.min(100, hungryLevel)) / 100) * 0.2;
    const genderBuildFactor = gender === 'male' ? 1.1 : 0.9;
    const ageScaleFactor = 0.8 + ((Math.max(1, Math.min(age, 60)) - 1) / 59) * 0.2;

    let torsoW = TORSO_W_BASE * hungerFactor * genderBuildFactor * ageScaleFactor;
    let armW = ARM_W_BASE * hungerFactor * genderBuildFactor * ageScaleFactor;
    let legW = LEG_W_BASE * hungerFactor * ageScaleFactor;

    if (isPregnant && gender === 'female') {
      torsoW *= 1.5;
    }

    // --- Define Base Positions ---
    const torsoX = Math.round((vGridWidth - torsoW) / 2);
    const headX = Math.round((vGridWidth - HEAD_W) / 2);
    const leftArmX = torsoX - armW;
    const rightArmX = torsoX + torsoW;
    const legStanceWidth = 1;
    const leftLegX = torsoX + (torsoW / 2 - legStanceWidth / 2) - legW;
    const rightLegX = torsoX + (torsoW / 2 + legStanceWidth / 2);

    const showBackOfHead = direction[1] < -0.2 && Math.abs(direction[0]) < 0.7;

    // --- Reusable Drawing Functions ---
    const drawShadow = (yOff: number) => {
      ctx.fillStyle = SHADOW_COLOR;
      ctx.beginPath();
      const shadowCenterX = vGridWidth / 2;
      const shadowCenterY = yOff;
      ctx.ellipse(
        Math.floor(shadowCenterX * scale),
        Math.floor(shadowCenterY * scale),
        Math.max(1, Math.floor(SHADOW_RADIUS_X * scale)),
        Math.max(1, Math.floor(SHADOW_RADIUS_Y * scale)),
        0,
        0,
        2 * Math.PI,
      );
      ctx.fill();
    };

    const drawTorso = (yOff: number, skinColor: string) => {
      if (gender === 'male') {
        // Skin part
        drawPixel(ctx, torsoX, TORSO_Y + yOff, torsoW, TORSO_H - MALE_PANTS_H, skinColor, scale);
        // Pants
        drawPixel(
          ctx,
          torsoX,
          TORSO_Y + TORSO_H - MALE_PANTS_H + yOff,
          torsoW,
          MALE_PANTS_H,
          malePantsColor,
          scale,
        );
      } else {
        // Female top
        drawPixel(ctx, torsoX, TORSO_Y + yOff, torsoW, TORSO_H, femaleTopColor, scale);
      }
    };

    const drawHead = (yOff: number, skinColor: string) => {
      if (showBackOfHead) {
        drawPixel(ctx, headX, HEAD_Y + yOff, HEAD_W, HEAD_H, hairColor, scale);
      } else {
        // Face
        drawPixel(ctx, headX, HEAD_Y + yOff, HEAD_W, HEAD_H, skinColor, scale);
        // Hair Top
        drawPixel(ctx, headX, HEAD_Y + yOff, HEAD_W, HAIR_H, hairColor, scale);
        if (gender === 'female') {
          // Long hair sides
          drawPixel(ctx, headX - 1, HEAD_Y + HAIR_H + yOff, 1, HEAD_H, hairColor, scale);
          drawPixel(ctx, headX + HEAD_W, HEAD_Y + HAIR_H + yOff, 1, HEAD_H, hairColor, scale);
        } else {
          // Beard
          drawPixel(ctx, headX + 1, HEAD_Y + 2 + yOff, HEAD_W - 2, HEAD_H - 2, hairColor, scale);
        }
      }
    };

    // --- Stance-Specific Rendering ---
    // Each case is self-contained to prevent animation state bleeding.
    switch (stance) {
      case 'idle': {
        const idleCycle = progress * Math.PI * 2;
        const sway = Math.sin(idleCycle) * 0.5;
        const bob = (Math.cos(idleCycle * 2) + 1) * 0.25;
        const yOff = bob;
        drawShadow(LEG_Y + LEG_H + 1);
        drawPixel(ctx, leftLegX + sway, LEG_Y + yOff, legW, LEG_H, baseSkinColor, scale);
        drawPixel(ctx, rightLegX - sway, LEG_Y + yOff, legW, LEG_H, baseSkinColor, scale);
        drawTorso(yOff, baseSkinColor);
        drawPixel(ctx, leftArmX, ARM_Y + yOff, armW, ARM_H, baseSkinColor, scale);
        drawPixel(ctx, rightArmX, ARM_Y + yOff, armW, ARM_H, baseSkinColor, scale);
        drawHead(yOff, baseSkinColor);
        break;
      }
      case 'walk': {
        const angle = progress * Math.PI * 2;
        const move = Math.sin(angle) * 2;
        const bob = Math.abs(Math.cos(angle)) * 1;
        const yOff = bob;
        drawShadow(LEG_Y + LEG_H + 1);
        drawPixel(ctx, leftLegX + move, LEG_Y + yOff, legW, LEG_H, baseSkinColor, scale);
        drawPixel(ctx, rightLegX - move, LEG_Y + yOff, legW, LEG_H, baseSkinColor, scale);
        drawTorso(yOff, baseSkinColor);
        drawPixel(ctx, leftArmX - move, ARM_Y + yOff, armW, ARM_H, baseSkinColor, scale);
        drawPixel(ctx, rightArmX + move, ARM_Y + yOff, armW, ARM_H, baseSkinColor, scale);
        drawHead(yOff, baseSkinColor);
        break;
      }
      case 'gathering': {
        const cycle = progress * Math.PI * 2;
        const kneeBend = 1;
        const armReach = ((Math.sin(cycle) + 1) / 2) * 2;
        const yOff = kneeBend + Math.abs(Math.cos(cycle)) * 0.5;
        drawShadow(LEG_Y + LEG_H + 1);
        drawPixel(ctx, leftLegX, LEG_Y + yOff, legW, LEG_H - kneeBend, baseSkinColor, scale);
        drawPixel(ctx, rightLegX, LEG_Y + yOff, legW, LEG_H - kneeBend, baseSkinColor, scale);
        drawTorso(yOff, baseSkinColor);
        drawPixel(ctx, leftArmX + 1, ARM_Y + yOff - armReach, armW, ARM_H, baseSkinColor, scale);
        drawPixel(ctx, rightArmX - 1, ARM_Y + yOff - armReach, armW, ARM_H, baseSkinColor, scale);
        drawHead(yOff, baseSkinColor);
        break;
      }
      case 'eat': {
        const kneeBend = 1;
        const yOff = kneeBend;
        drawShadow(LEG_Y + LEG_H + 1);
        drawPixel(ctx, leftLegX, LEG_Y + yOff, legW, LEG_H - kneeBend, baseSkinColor, scale);
        drawPixel(ctx, rightLegX, LEG_Y + yOff, legW, LEG_H - kneeBend, baseSkinColor, scale);
        drawTorso(yOff, baseSkinColor);
        const eatAnim = (Math.sin(progress * Math.PI * 4) + 1) / 2;
        const handTargetX = headX + HEAD_W / 2;
        const handTargetY = HEAD_Y + HEAD_H / 2;
        const handX = rightArmX + (handTargetX - rightArmX) * eatAnim;
        const handY = ARM_Y + yOff + (handTargetY - (ARM_Y + yOff)) * eatAnim;
        drawPixel(ctx, leftArmX, ARM_Y + yOff, armW, ARM_H, baseSkinColor, scale);
        drawPixel(ctx, handX, handY, armW, ARM_H, baseSkinColor, scale);
        drawPixel(ctx, handX, handY - 1, 1, 1, foodColor, scale);
        drawHead(yOff, baseSkinColor);
        break;
      }
      case 'procreate': {
        const glowAlpha = (Math.sin(progress * Math.PI * 8) + 1) / 4; // 0 to 0.5
        const thrust = (Math.sin(progress * Math.PI * 6) + 1) * 0.5;
        const kneeBend = 1.5;
        const yOff = kneeBend - thrust;
        drawShadow(LEG_Y + LEG_H + 1);
        drawPixel(ctx, leftLegX, LEG_Y + yOff, legW, LEG_H - kneeBend, baseSkinColor, scale);
        drawPixel(ctx, rightLegX, LEG_Y + yOff, legW, LEG_H - kneeBend, baseSkinColor, scale);
        drawTorso(yOff, baseSkinColor);
        drawPixel(ctx, leftArmX, ARM_Y + yOff, armW, ARM_H, baseSkinColor, scale);
        drawPixel(ctx, rightArmX, ARM_Y + yOff, armW, ARM_H, baseSkinColor, scale);
        drawHead(yOff, baseSkinColor);
        // Subtle glow effect instead of color change
        ctx.globalAlpha = glowAlpha;
        drawTorso(yOff, 'white');
        ctx.globalAlpha = 1.0;
        break;
      }
      case 'attacking': {
        const lunge = Math.sin(progress * Math.PI) * 1.5;
        const yOff = Math.abs(Math.sin(progress * Math.PI));
        drawShadow(LEG_Y + LEG_H + 1);
        drawPixel(ctx, leftLegX - lunge, LEG_Y + yOff, legW, LEG_H, baseSkinColor, scale);
        drawPixel(ctx, rightLegX + lunge * 0.5, LEG_Y + yOff, legW, LEG_H, baseSkinColor, scale);
        drawTorso(yOff, baseSkinColor);
        drawPixel(ctx, leftArmX, ARM_Y + yOff - 2, armW, ARM_H, baseSkinColor, scale);
        drawPixel(ctx, rightArmX, ARM_Y + yOff - 2.5, armW, ARM_H, baseSkinColor, scale);
        drawHead(yOff, baseSkinColor);
        break;
      }
      case 'defending': {
        const crouch = 1;
        drawShadow(LEG_Y + LEG_H + 1);
        drawPixel(ctx, leftLegX, LEG_Y + crouch, legW, LEG_H - crouch, baseSkinColor, scale);
        drawPixel(ctx, rightLegX, LEG_Y + crouch, legW, LEG_H - crouch, baseSkinColor, scale);
        drawTorso(crouch, baseSkinColor);
        drawPixel(ctx, leftArmX - 1, ARM_Y + crouch - 1, armW, ARM_H, baseSkinColor, scale);
        drawPixel(ctx, rightArmX + 1, ARM_Y + crouch - 1, armW, ARM_H, baseSkinColor, scale);
        drawHead(crouch, baseSkinColor);
        break;
      }
      case 'stunned':
      case 'dead': {
        const isDead = stance === 'dead';
        const decay = isDead ? Math.min(1, progress) : 0;
        const skin = decay > 0.5 ? boneColor : baseSkinColor;
        const clothColor = gender === 'male' ? malePantsColor : femaleTopColor;
        const hair = decay > 0.8 ? 'transparent' : hairColor;

        const bodyCenterX = vGridWidth / 2;
        const bodyCenterY = vGridHeight / 2;
        const splay = 2;

        drawShadow(vGridHeight - 1);

        // Limbs
        drawPixel(ctx, bodyCenterX - legW - splay, bodyCenterY, legW, LEG_H, skin, scale);
        drawPixel(ctx, bodyCenterX + splay, bodyCenterY, legW, LEG_H, skin, scale);
        drawPixel(ctx, bodyCenterX - armW - splay, bodyCenterY - TORSO_H + 1, armW, ARM_H, skin, scale);
        drawPixel(ctx, bodyCenterX + splay, bodyCenterY - TORSO_H + 1, armW, ARM_H, skin, scale);

        // Torso
        const tX = bodyCenterX - torsoW / 2;
        const tY = bodyCenterY - TORSO_H / 2;
        if (gender === 'male') {
          if (decay < 0.7)
            drawPixel(ctx, tX, tY + TORSO_H - MALE_PANTS_H, torsoW, MALE_PANTS_H, clothColor, scale);
          drawPixel(ctx, tX, tY, torsoW, TORSO_H - MALE_PANTS_H, skin, scale);
        } else {
          if (decay < 0.7) drawPixel(ctx, tX, tY, torsoW, TORSO_H, clothColor, scale);
          else drawPixel(ctx, tX, tY, torsoW, TORSO_H, skin, scale); // Faded clothes become skin/bone
        }

        // Head
        const hX = bodyCenterX - HEAD_W / 2;
        const hY = bodyCenterY - TORSO_H / 2 - HEAD_H + 1;
        drawPixel(ctx, hX, hY, HEAD_W, HEAD_H, skin, scale);
        if (hair !== 'transparent') drawPixel(ctx, hX, hY, HEAD_W, HAIR_H, hair, scale);

        // Skeleton Ribs
        if (isDead && decay > 0.6) {
          const ribColor = '#B0A890';
          for (let i = 0; i < 3; i++) {
            drawPixel(ctx, tX + 1, tY + i * 1 + 1, torsoW - 2, 0.5, ribColor, scale);
          }
        }
        break;
      }
      default:
        // Draw a magenta box to indicate an unimplemented stance
        drawPixel(ctx, 0, 0, vGridWidth, vGridHeight, 'magenta', scale);
        break;
    }

    ctx.restore();
  },
};

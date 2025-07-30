import { Asset } from '../../../generator-core/src/assets-types';

// Helper to create a HSL color string from a gene segment.
const getColor = (geneCode: number, offset: number, saturation: number = 70, lightness: number = 50) => {
    const value = (geneCode >> offset) & 0xFF;
    const hue = Math.floor((value / 255) * 360);
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

// Helper to darken an HSL color, for the far-side legs.
const darkenColor = (hslColor: string, amount: number): string => {
    const match = hslColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (!match) return hslColor;
    const [h, s, l] = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
    return `hsl(${h}, ${s}%, ${Math.max(0, l - amount)}%)`;
};

// Helper to draw a single leg.
const drawLeg = (
    ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number,
    angle: number, color: string, isFarLeg: boolean = false
) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = isFarLeg ? darkenColor(color, 15) : color;
    ctx.beginPath();
    ctx.roundRect(-w / 2, 0, w, h, w / 2);
    ctx.fill();
    ctx.restore();
};

// Helper to interpolate an HSL color towards a target gray color for the dead stance.
const lerpToGray = (hslColor: string, t: number): string => {
    const match = hslColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    const targetLightness = 75; // Lightness of a bone-like gray
    if (!match) return `hsl(0, 0%, ${targetLightness}%)`;
    
    const [, h, s, l] = match.map(Number);
    const newS = s * (1 - t);
    const newL = l + (targetLightness - l) * t;
    
    return `hsl(${h}, ${newS}%, ${newL}%)`;
};

export const TribePrey2D: Asset = {
  name: 'tribe-prey-2d',
  referenceImage: 'swos.png',

  description: `A 2D prey asset for the Tribe game, featuring various stances and animations.

Prey is an animal which can be hunted by predators or humans in the Tribe game.

Preys look like small 4 leg mammals, with a simple and recognizable design. The characters are designed to be easily distinguishable and animated in a way that conveys their actions clearly.

# Visual style

Prey characters in the Tribe game are inspired by classic 2D pixel art, they look like Sensible Soccer players(Sensible Soccer game visual style is IMPORTANT), with a simple and recognizable design. The characters are designed to be easily distinguishable and animated in a way that conveys their actions clearly.

Character in Tribe game look like creatures from stone age, they have simple clothing, no shoes, and no modern accessories. The characters are designed to be easily distinguishable and animated in away that conveys their actions clearly.

Prey walks on all fours, unlike human (two legs).

Each prey is described by a unique gene code, which is a number that defines its appearance, size, and other characteristics. The gene code is used to generate the character's appearance, including body proportions, color, and other visual features. The gene code is a 32-bit integer, with each bit representing a specific characteristic of the character.

Prey should have should have visible body parts, such as head, torso, arms, and legs. The body parts should be connected and should not overlap. The character's body parts should be simple shapes, such as circles and rectangles, with solid colors and no gradients or patterns.

Preys are supposed to be sympathetic and friendly, so the character's face should have a friendly expression, with a smile and bright eyes. The character's eyes should be large and expressive, with a simple design.

# Technical details

The asset is rendered on a canvas using the CanvasRenderingContext2D API. The rendering function takes parameters for position, size, progress, stance, direction, gender, and age. The character can face left or right, and the rendering adapts based on the stance (e.g., idle, walk, eat, procreate).
The rendering function must be simple and efficient, it should not use complex patterns or gradients, and should focus on solid colors and basic shapes to maintain the pixel art aesthetic.

15% padding from all edges of the rendering box is required to ensure the character is not cut off during rendering.

Subtle shadow should be drawn under the a character to give it a sense of depth.

IMPORTANT: The character is visible from the side, just like in Sensible Soccer.

# Rendering parameters

- age: The age of the character, which affects the size and proportions of the body parts. Age is a number between 1 and 60, with 20 being the average age.
- gender:
  - 'male': Male prey are larger and more robust, with a more pronounced musculature.
  - 'female': Female prey are smaller and more agile, with a leaner build.
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
- 'eat': The character holds food and brings it to their mouth, with a slight bend at the knees.
- 'procreate': The character performs a mating animation, with a specific pose and movement. There should be some additional visual effects to indicate this action, such as a slight glow or aura around the characters, or a dust particles to indicate movement.
- 'dead': The character lies on the ground, with limbs relaxed and a neutral expression, slowly turns into a grey skeleton over time. The character pose and body parts should not be animated in this stance, as the character is dead so it should not move.`,

  stances: ['idle', 'walk', 'eat', 'dead', 'procreate'],
  render(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    progress: number,
    stance: string,
    props: {
      gender: 'male' | 'female';
      age: number;
      direction: [number, number];
      isPregnant: boolean;
      hungryLevel: number;
      geneCode: number;
    } = {
      gender: 'male',
      age: 20,
      direction: [1, 0],
      isPregnant: false,
      hungryLevel: 0,
      geneCode: 0x804020,
    },
  ) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    const padding = width * 0.15;
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const effectiveWidth = width - padding * 2;
    const effectiveHeight = height - padding * 2;

    const { gender, age, direction, isPregnant, hungryLevel, geneCode } = props;

    const ageScale = 0.7 + (Math.min(age, 40) / 40) * 0.5;
    const genderScale = gender === 'male' ? 1.05 : 0.95;
    const hungerScale = 1.0 - (hungryLevel / 100) * 0.3;

    const baseBodyWidth = effectiveWidth * 0.5 * hungerScale * ageScale * genderScale;
    let baseBodyHeight = effectiveHeight * 0.3 * ageScale * genderScale;
    const headRadius = effectiveWidth * 0.15 * ageScale * genderScale;
    const legWidth = baseBodyWidth * 0.2;
    const legHeight = effectiveHeight * 0.3;

    const skinColor = getColor(geneCode, 0, 30, 50);
    let furColor = getColor(geneCode, 8, 50, 40);
    if (age > 45) {
        const grayness = Math.min(1, (age - 45) / 15);
        furColor = lerpToGray(furColor, grayness);
    }
    
    ctx.translate(centerX, centerY);
    if (direction[0] < 0) ctx.scale(-1, 1);

    const animSin = Math.sin(progress * Math.PI * 2);
    const animCos = Math.cos(progress * Math.PI * 2);
    const shadowY = legHeight + baseBodyHeight * 0.2;

    if (stance === 'dead') {
      const t = Math.min(progress, 1);
      ctx.translate(0, effectiveHeight * 0.2);
      ctx.rotate(Math.PI / 2);
      
      // Corpse color fades to bone
      const boneColor = lerpToGray(furColor, t);
      const skullColor = lerpToGray(skinColor, t);

      // Draw skeleton, which becomes more prominent as t -> 1
      ctx.globalAlpha = 0.5 + t * 0.5;
      ctx.strokeStyle = boneColor;
      ctx.lineWidth = legWidth * 0.5;
      // Spine & Ribs
      ctx.beginPath();
      ctx.moveTo(-baseBodyWidth * 0.4, 0);
      ctx.lineTo(baseBodyWidth * 0.4, 0);
      ctx.stroke();
      for (let i = -1; i <= 1; i += 1) {
          ctx.beginPath();
          ctx.arc(0, 0, baseBodyHeight * 0.4, Math.PI * 0.4 * i - Math.PI*0.2, Math.PI * 0.4 * i + Math.PI*0.2);
          ctx.stroke();
      }
      // Skull
      ctx.fillStyle = skullColor;
      ctx.beginPath();
      ctx.arc(baseBodyWidth * 0.5, 0, headRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'black';
      ctx.beginPath();
      ctx.arc(baseBodyWidth * 0.55, 0, headRadius * 0.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      return;
    }

    // Draw Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.beginPath();
    ctx.ellipse(0, shadowY, baseBodyWidth * 0.7, baseBodyWidth * 0.25, 0, 0, 2 * Math.PI);
    ctx.fill();

    let headYOffset = 0, bodyYOffset = 0;
    let leg1Angle = 0, leg2Angle = 0, leg3Angle = 0, leg4Angle = 0;

    switch (stance) {
      case 'idle':
        bodyYOffset = animSin * (effectiveHeight * 0.02);
        leg1Angle = animSin * 0.05; leg2Angle = -animSin * 0.05;
        leg3Angle = -animSin * 0.05; leg4Angle = animSin * 0.05;
        break;
      case 'walk':
        bodyYOffset = Math.abs(animCos) * (effectiveHeight * -0.04);
        leg1Angle = animSin * 0.7; leg2Angle = -animSin * 0.7;
        leg3Angle = -animSin * 0.7; leg4Angle = animSin * 0.7;
        break;
      case 'eat':
        headYOffset = effectiveHeight * 0.1;
        bodyYOffset = effectiveHeight * 0.05;
        headYOffset += animSin * (effectiveHeight * 0.02);
        break;
      case 'procreate':
        bodyYOffset = effectiveHeight * 0.05;
        const thrust = (1 - animCos) * -effectiveWidth * 0.05;
        ctx.translate(thrust, 0);
        ctx.shadowColor = 'rgba(255, 182, 193, 0.9)';
        ctx.shadowBlur = 10;
        break;
    }

    if (isPregnant && gender === 'female') {
        baseBodyHeight *= 1.6;
    }
    
    const torsoY = bodyYOffset;
    const bodyCenterline = torsoY - baseBodyHeight * 0.2;

    // Far-side legs (drawn first)
    drawLeg(ctx, baseBodyWidth * -0.35, bodyCenterline, legWidth, legHeight, leg3Angle, furColor, true);
    drawLeg(ctx, baseBodyWidth * 0.35, bodyCenterline, legWidth, legHeight, leg4Angle, furColor, true);
    
    // Body
    ctx.fillStyle = furColor;
    ctx.beginPath();
    ctx.ellipse(0, torsoY, baseBodyWidth / 2, baseBodyHeight / 2, 0, 0, 2 * Math.PI);
    ctx.fill();

    // Head
    const headX = baseBodyWidth * 0.45;
    const headY = bodyCenterline + headYOffset;
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(headX, headY, headRadius, 0, Math.PI * 2);
    ctx.fill();

    // Face details if not facing away
    if (direction[1] >= 0) {
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(headX + headRadius * 0.3, headY - headRadius * 0.2, headRadius * 0.15, 0, Math.PI * 2);
        ctx.fill();
    }

    // Near-side legs
    drawLeg(ctx, baseBodyWidth * -0.35, bodyCenterline, legWidth, legHeight, leg1Angle, furColor);
    drawLeg(ctx, baseBodyWidth * 0.35, bodyCenterline, legWidth, legHeight, leg2Angle, furColor);
    
    ctx.restore();
  },
};

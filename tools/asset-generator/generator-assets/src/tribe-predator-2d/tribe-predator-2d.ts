import { Asset } from '../../../generator-core/src/assets-types';

export type ParsedGenes = {
  furColor: string;
  darkerFurColor: string;
  skinColor: string;
  eyeColor: string;
};

// Helper to create a darker version of a color
function darkenColor(color: string, amount: number): string {
  let [r, g, b] = color.match(/\d+/g)!.map(Number);
  r = Math.max(0, r - amount);
  g = Math.max(0, g - amount);
  b = Math.max(0, b - amount);
  return `rgb(${r}, ${g}, ${b})`;
}

export function parseGeneCode(geneCode: number): ParsedGenes {
  const r = (geneCode & 0xff0000) >> 16;
  const g = (geneCode & 0x00ff00) >> 8;
  const b = geneCode & 0x0000ff;
  const furColor = `rgb(${r}, ${g}, ${b})`;
  const darkerFurColor = darkenColor(furColor, 40);

  const skinR = ((geneCode & 0xff) % 100) + 50;
  const skinG = ((geneCode >> 8) & 0xff) % 100;
  const skinB = ((geneCode >> 16) & 0xff) % 100;
  const skinColor = `rgb(${skinR}, ${skinG}, ${skinB})`;

  const eyeColor = (geneCode & 0x800000) !== 0 ? '#00aaff' : '#ffaa00';

  return { furColor, darkerFurColor, skinColor, eyeColor };
}

export function mutateGeneCodes(genCode1: number, genCode2: number): number {
  const mask = 0x00ffffff; // Mask to keep only the first 24 bits
  const newGenes = (genCode1 & mask) ^ (genCode2 & mask);
  return newGenes;
}

export function generateRandomGeneCode(): number {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  return (r << 16) | (g << 8) | b;
}

export const TribePredator2D: Asset = {
  name: 'tribe-predator-2d',
  referenceImage: 'swos.png',

  description: `A 2D predator asset for the Tribe game, featuring various stances and animations.

Predator is an animal which can hunt and attack humans in the Tribe game. It is designed to be a threat to the player, adding an element of danger and challenge to the game world.

Predator look like bears or wolves, with a simple and recognizable design. The characters are designed to be easily distinguishable and animated in a way that conveys their actions clearly.

# Visual style

Predator characters in the Tribe game are inspired by classic 2D pixel art, they look like Sensible Soccer players(Sensible Soccer game visual style is IMPORTANT), with a simple and recognizable design. The characters are designed to be easily distinguishable and animated in a way that conveys their actions clearly.

Character in Tribe game look like creatures from stone age, they have simple clothing, no shoes, and no modern accessories. The characters are designed to be easily distinguishable and animated in away that conveys their actions clearly.

Predator walks on arms and legs, unlike human (two legs).

Each predator is described by a unique gene code, which is a number that defines its appearance, size, and other characteristics. The gene code is used to generate the character's appearance, including body proportions, color, and other visual features. The gene code is a 32-bit integer, with each bit representing a specific characteristic of the character.

Predator should have visible ears, eyes, and mouth with teeth. It must have a tail. Front legs should be shorter than back legs, and they should be positioned closer to the body. The character's body should be wider at the top and narrower at the bottom, with a slight curve to the back. The character's head should be larger than the body, with a pronounced jaw and sharp teeth.

# Technical details

The asset is rendered on a canvas using the CanvasRenderingContext2D API. The rendering function takes parameters for position, size, progress, stance, direction, gender, and age. The character can face left or right, and the rendering adapts based on the stance (e.g., idle, walk, eat, procreate).
The rendering function must be simple and efficient, it should not use complex patterns or gradients, and should focus on solid colors and basic shapes to maintain the pixel art aesthetic.

15% padding from all edges of the rendering box is required to ensure the character is not cut off during rendering.

Subtle shadow should be drawn under the a character to give it a sense of depth.

IMPORTANT: The character is visible from the side, just like in Sensible Soccer.

# Rendering parameters

- age: The age of the character, which affects the size and proportions of the body parts. Age is a number between 1 and 20, with 3 being the average age.
- gender:
  - 'male': Male predators are larger and more robust, with a more pronounced musculature.
  - 'female': Female predators are smaller and more agile, with a leaner build.
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
- 'attacking': The character performs an attack animation, with arms raised and a forward motion.
- 'dead': The character lies on the ground, with limbs relaxed and a neutral expression, slowly turns into a grey skeleton over time. The character pose and body parts should not be animated in this stance, as the character is dead so it should not move.`,

  stances: ['idle', 'walk', 'eat', 'dead', 'attacking', 'procreate'],
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
    const { gender, age, direction, isPregnant, hungryLevel, geneCode } = props;

    ctx.save();

    const padding = width * 0.15;
    const p = Math.max(1, Math.floor((width - padding * 2) / 10)); // Pixel size, base 10 pixels wide
    const flip = direction[0] < 0;

    // Center asset and apply flip
    ctx.translate(x + width / 2, y + height / 2);
    if (flip) ctx.scale(-1, 1);

    const genes = parseGeneCode(geneCode);
    const ageRatio = 0.8 + (Math.min(age, 20) / 20) * 0.4;
    const genderScale = gender === 'male' ? 1.05 : 0.95;
    const hungerScale = 1.0 - (hungryLevel / 100) * 0.25;
    const scale = ageRatio * genderScale * hungerScale;

    // Apply grayscale for old age
    const ageGrayscale = Math.max(0, Math.min(1, (age - 15) / 5));
    ctx.filter = `grayscale(${ageGrayscale})`;

    const furColor = genes.furColor;
    const darkFurColor = genes.darkerFurColor;
    const eyeColor = genes.eyeColor;
    const teethColor = '#FFFFFF';
    const meatColor = '#c75c5c';
    const skeletonColor = '#E0E0E0';
    const boneShadowColor = '#A0A0A0';
    const groundY = height / 2 - 2 * p;

    // Common animation values
    const animCycle = Math.sin(progress * Math.PI * 2);
    const animCycleAbs = Math.abs(animCycle);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(0, groundY, p * 4, p, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.filter = 'none'; // reset filter for color drawing

    if (stance === 'dead') {
      const decay = Math.min(1, progress * 2); // Decay happens over first half of progress
      ctx.save();
      ctx.translate(0, groundY - p * 3);
      ctx.rotate(-Math.PI / 2);

      const drawBone = (sx: number, sy: number, sw: number, sh: number, shadow: boolean = false) => {
        ctx.fillStyle = shadow ? boneShadowColor : skeletonColor;
        ctx.fillRect(sx * p, sy * p, sw * p, sh * p);
      };

      if (decay < 1) {
        ctx.globalAlpha = 1 - decay;
        ctx.fillStyle = furColor;
        // Draw a simple collapsed body shape
        ctx.beginPath();
        ctx.ellipse(0, 0, p * 3, p * 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      if (decay > 0) {
        ctx.globalAlpha = decay;
        // A more recognizable skeleton
        drawBone(-1, -4, 2, 2); // Skull
        drawBone(1, -3.5, 1, 1, true); // Eye socket
        drawBone(-0.5, -2, 1, 5, true); // Spine
        // Ribs
        drawBone(-2.5, -1, 5, 0.5);
        drawBone(-2.5, 0, 5, 0.5);
        drawBone(-2.5, 1, 5, 0.5);
        // Limbs
        drawBone(-3, -2, -1, 2, true);
        drawBone(3, -2, 1, 2);
        drawBone(-3, 2, -1, 2, true);
        drawBone(3, 2, 1, 2);
        ctx.globalAlpha = 1;
      }

      ctx.restore();
      ctx.restore();
      return;
    }

    ctx.fillStyle = furColor;

    // Stance-specific adjustments
    let bodyYOffset = 0;
    let headXOffset = 0;
    let headYOffset = 0;
    let legMovement = [0, 0, 0, 0]; // [back_far, back_near, front_far, front_near]

    switch (stance) {
      case 'idle':
        bodyYOffset = animCycle * p * 0.1;
        break;
      case 'walk':
        const walkFrame = Math.sin(progress * Math.PI * 4);
        bodyYOffset = Math.abs(walkFrame) * -p * 0.5;
        legMovement = [walkFrame * p, -walkFrame * p, -walkFrame * p, walkFrame * p];
        break;
      case 'attacking':
        const lunge = Math.sin(progress * Math.PI * 4);
        headXOffset = p * 2 + lunge * p;
        headYOffset = p * 2;
        bodyYOffset = p;
        break;
      case 'eat':
        headYOffset = p * 3 + animCycleAbs * p;
        bodyYOffset = p * 1.5;
        ctx.fillStyle = meatColor;
        ctx.fillRect(-p, groundY - p, p * 2, p);
        break;
      case 'procreate':
        const thrust = Math.sin(progress * Math.PI * 8);
        bodyYOffset = thrust * p * 0.3;
        // Dust particles
        ctx.fillStyle = 'rgba(139, 69, 19, 0.5)';
        for (let i = 0; i < 5; i++) {
          const particleX = (Math.random() - 0.5) * p * 8;
          const particleY = groundY + (Math.random() - 0.5) * p * 2;
          if (animCycleAbs > 0.5) {
            ctx.fillRect(particleX, particleY, p * 0.5, p * 0.5);
          }
        }
        break;
    }

    const bodyH = p * 3 * scale * (isPregnant ? 1.3 : 1);
    const bodyW = p * 5 * scale;
    const bodyX = -bodyW / 1.5;
    const bodyY = groundY - bodyH - p * 2.5 + bodyYOffset;

    // Tail
    ctx.fillStyle = furColor;
    ctx.beginPath();
    ctx.moveTo(bodyX - p * 0.5, bodyY + bodyH * 0.5);
    ctx.quadraticCurveTo(bodyX - p * 3, bodyY - p, bodyX - p * 2 + animCycle * p, bodyY + bodyH + p);
    ctx.fill();

    const legW = p * 1.2 * scale;
    const backLegH = p * 3 * scale;
    const frontLegH = p * 2.5 * scale;
    const backLegX = bodyX + bodyW * 0.8;
    const frontLegX = bodyX + bodyW * 0.2;

    // Far legs (darker)
    ctx.fillStyle = darkFurColor;
    ctx.fillRect(frontLegX, groundY - frontLegH, legW, frontLegH + legMovement[2]);
    ctx.fillRect(backLegX, groundY - backLegH, legW, backLegH + legMovement[0]);

    // Body
    ctx.fillStyle = furColor;
    ctx.beginPath();
    ctx.moveTo(bodyX, bodyY + bodyH);
    ctx.lineTo(bodyX, bodyY + p);
    ctx.quadraticCurveTo(bodyX + bodyW / 2, bodyY, bodyX + bodyW, bodyY + p);
    ctx.lineTo(bodyX + bodyW, bodyY + bodyH);
    ctx.fill();

    // Near legs (lighter)
    ctx.fillStyle = furColor;
    ctx.fillRect(frontLegX + p / 2, groundY - frontLegH, legW, frontLegH + legMovement[3]);
    ctx.fillRect(backLegX + p / 2, groundY - backLegH, legW, backLegH + legMovement[1]);

    // Head
    const headS = p * 3.5 * scale;
    const headX = bodyX + bodyW - headS * 0.3 + headXOffset;
    const headY = bodyY - headS * 0.3 + headYOffset;
    ctx.fillStyle = furColor;
    ctx.beginPath();
    ctx.arc(headX, headY, headS / 2, 0, Math.PI * 2);
    ctx.fill();

    // Snout
    ctx.beginPath();
    ctx.ellipse(headX + headS * 0.4, headY + headS * 0.2, p * 1.5, p, 0, 0, Math.PI * 2);
    ctx.fill();

    const facingViewer = direction[1] >= 0;
    if (facingViewer) {
      // Eye
      ctx.fillStyle = eyeColor;
      ctx.fillRect(headX + p * 0.5, headY - p * 0.5, p * 0.5, p * 0.5);

      // Mouth
      if (stance === 'attacking') {
        ctx.fillStyle = teethColor;
        ctx.fillRect(headX + headS * 0.5, headY + headS * 0.4, p, p * 0.4);
      }
    }

    // Ear (always visible from side)
    ctx.fillStyle = darkFurColor;
    ctx.beginPath();
    ctx.moveTo(headX - headS * 0.4, headY - headS * 0.3);
    ctx.lineTo(headX, headY - headS * 0.7);
    ctx.lineTo(headX, headY - headS * 0.2);
    ctx.fill();

    ctx.restore();
  },
};

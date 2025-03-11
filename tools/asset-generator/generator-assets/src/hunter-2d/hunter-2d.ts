import { Asset } from '../../../generator-core/src/assets-types';

export const Hunter2d: Asset = {
  name: 'hunter-2d',
  stances: ['standing', 'walking', 'running', 'idle', 'attacking', 'defending', 'throwing'],
  description: `# Two dimensional representation of a hunter game asset

# Setting

Hunter is a character in a game where lions hunt prey animals, and hunter is a special character that can hunt lions.

# Projecting a hunter in a 2D space

Hunter is rendered from the side view in a 2D space.

# Style

Cartoon style, with a focus on simplicity and clarity.
Limited color palette and bold outlines.

# Animation States

- standing: Default pose with subtle movement
- walking: Moderate leg movement and body bounce
- running: Exaggerated leg movement and pronounced bounce
- idle: Very subtle movements showing the hunter at rest
- sleeping: Hunter in a sleeping pose
- attacking: Hunter attacking with a weapon
- defending: Hunter defending against an attack
- throwing: Hunter throwing a weapon
`,

  render(ctx: CanvasRenderingContext2D, progress: number, stance: string, direction: 'left' | 'right'): void {
    // Save the current context state
    ctx.save();

    // Apply horizontal flip if facing left
    if (direction === 'left') {
      ctx.scale(-1, 1);
      ctx.translate(-100, 0);
    }

    // Define colors
    const skinColor = '#D2B48C';
    const clothColor = '#556B2F';
    const bootColor = '#8B4513';
    const hatColor = '#8B4513';
    const outlineColor = '#000000';
    const rifleColor = '#8B4513';

    // Calculate animation progress
    const bounceHeight = Math.sin(progress * Math.PI * 2) * 3;
    const legSwing = Math.sin(progress * Math.PI * 2) * 15;
    const armSwing = Math.sin(progress * Math.PI * 2) * 10;
    const breathe = Math.sin(progress * Math.PI * 2) * 1;

    // Apply stance-specific animations
    let legAngle = 0;
    let armAngle = 0;
    let bodyOffsetY = 0;
    let rifleRotation = 0;
    let isAttacking = false;
    let isThrowing = false;
    let isDefending = false;

    switch (stance) {
      case 'walking':
        legAngle = legSwing;
        armAngle = armSwing;
        bodyOffsetY = bounceHeight / 2;
        break;
      case 'running':
        legAngle = legSwing * 1.5;
        armAngle = armSwing * 1.5;
        bodyOffsetY = bounceHeight;
        break;
      case 'idle':
        bodyOffsetY = breathe / 2;
        break;
      case 'attacking':
        armAngle = -45 + Math.sin(progress * Math.PI) * 30;
        rifleRotation = -20;
        isAttacking = true;
        break;
      case 'defending':
        armAngle = 30;
        bodyOffsetY = -5;
        isDefending = true;
        break;
      case 'throwing':
        armAngle = -90 + Math.sin(progress * Math.PI * 2) * 60;
        isThrowing = true;
        break;
      case 'standing':
      default:
        bodyOffsetY = breathe;
        break;
    }

    // Draw the hunter
    ctx.lineWidth = 2;

    // Draw legs
    ctx.save();
    ctx.translate(50, 70 + bodyOffsetY);

    // Left leg
    ctx.save();
    ctx.rotate((legAngle * Math.PI) / 180);

    // Boot
    ctx.fillStyle = bootColor;
    ctx.strokeStyle = outlineColor;
    ctx.beginPath();
    ctx.rect(-5, 20, 15, 10);
    ctx.fill();
    ctx.stroke();

    // Leg
    ctx.fillStyle = clothColor;
    ctx.beginPath();
    ctx.rect(-4, 0, 8, 20);
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    // Right leg
    ctx.save();
    ctx.rotate((-legAngle * Math.PI) / 180);

    // Boot
    ctx.fillStyle = bootColor;
    ctx.strokeStyle = outlineColor;
    ctx.beginPath();
    ctx.rect(-5, 20, 15, 10);
    ctx.fill();
    ctx.stroke();

    // Leg
    ctx.fillStyle = clothColor;
    ctx.beginPath();
    ctx.rect(-4, 0, 8, 20);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
    ctx.restore();

    // Draw body
    ctx.fillStyle = clothColor;
    ctx.strokeStyle = outlineColor;
    ctx.beginPath();
    ctx.rect(40, 40 + bodyOffsetY, 20, 30);
    ctx.fill();
    ctx.stroke();

    // Draw head
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(50, 30 + bodyOffsetY, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw hat
    ctx.fillStyle = hatColor;
    ctx.beginPath();
    ctx.arc(50, 25 + bodyOffsetY, 8, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(40, 25 + bodyOffsetY, 20, 3);
    ctx.fill();
    ctx.stroke();

    // Draw arms
    ctx.save();
    ctx.translate(50, 45 + bodyOffsetY);

    // Left arm
    ctx.save();
    ctx.rotate((armAngle * Math.PI) / 180);

    ctx.fillStyle = clothColor;
    ctx.beginPath();
    ctx.rect(-3, 0, 6, 15);
    ctx.fill();
    ctx.stroke();

    // Hand
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(0, 18, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw rifle if attacking
    if (isAttacking) {
      ctx.save();
      ctx.translate(0, 18);
      ctx.rotate((rifleRotation * Math.PI) / 180);

      // Rifle body
      ctx.fillStyle = rifleColor;
      ctx.beginPath();
      ctx.rect(0, -2, 25, 4);
      ctx.fill();
      ctx.stroke();

      // Rifle handle
      ctx.beginPath();
      ctx.rect(5, 2, 4, 8);
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }

    ctx.restore();

    // Right arm
    ctx.save();
    ctx.rotate((-armAngle * Math.PI) / 180);

    ctx.fillStyle = clothColor;
    ctx.beginPath();
    ctx.rect(-3, 0, 6, 15);
    ctx.fill();
    ctx.stroke();

    // Hand
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(0, 18, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw shield if defending
    if (isDefending) {
      ctx.save();
      ctx.translate(0, 18);

      // Shield
      ctx.fillStyle = '#A0522D';
      ctx.beginPath();
      ctx.ellipse(5, 0, 10, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Shield emblem
      ctx.fillStyle = '#DAA520';
      ctx.beginPath();
      ctx.arc(5, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }

    // Draw throwing object
    if (isThrowing) {
      ctx.save();
      ctx.translate(0, 18);

      // Calculate throw position
      const throwProgress = Math.max(0, Math.sin(progress * Math.PI));
      const throwX = throwProgress * 30;
      const throwY = throwProgress * -15 + throwProgress * throwProgress * 30;

      // Throw object (spear)
      ctx.fillStyle = '#8B4513';
      ctx.save();
      ctx.translate(throwX, throwY);
      ctx.rotate((45 * Math.PI) / 180);

      ctx.beginPath();
      ctx.rect(-2, -15, 4, 30);
      ctx.fill();
      ctx.stroke();

      // Spear tip
      ctx.fillStyle = '#C0C0C0';
      ctx.beginPath();
      ctx.moveTo(0, -20);
      ctx.lineTo(-4, -15);
      ctx.lineTo(4, -15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
      ctx.restore();
    }

    ctx.restore();

    ctx.restore();

    // Restore the context state
    ctx.restore();
  },
};

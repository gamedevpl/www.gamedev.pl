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

  render(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, progress: number, stance: string, direction: 'left' | 'right'): void {
    // Save the current context state
    ctx.save();

    // Apply transformations for positioning and scaling
    ctx.translate(x, y);
    ctx.scale(width / 100, height / 100);

    // Apply horizontal flip if facing left
    if (direction === 'left') {
      ctx.scale(-1, 1);
      ctx.translate(-100, 0);
    }

    // Define enhanced color palette
    const skinColor = '#E6B87A';
    const skinShadow = '#C69C6D';
    const clothColor = '#3A5F0B';
    const clothHighlight = '#4C7D0F';
    const bootColor = '#5D2906';
    const bootHighlight = '#7A3A0A';
    const hatColor = '#6B3E20';
    const hatHighlight = '#8B5A3C';
    const outlineColor = '#2A2A2A';
    const rifleColor = '#8B4513';
    const rifleHighlight = '#A65F1F';

    // Improved animation parameters
    const bounceHeight = Math.sin(progress * Math.PI * 2) * 3;
    const breathe = Math.sin(progress * Math.PI * 2) * 1.5;

    // Smoother animation curves using easing functions
    const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
    const smoothProgress = easeInOut(progress % 1);
    const legSwing = Math.sin(smoothProgress * Math.PI * 2) * 20;
    const armSwing = Math.sin(smoothProgress * Math.PI * 2) * 15;

    // Apply stance-specific animations with improved dynamics
    let legAngle = 0;
    let armAngle = 0;
    let bodyOffsetY = 0;
    let rifleRotation = 0;
    let isAttacking = false;
    let isThrowing = false;
    let isDefending = false;
    let headTilt = 0;
    let facingAngle = 0;

    switch (stance) {
      case 'walking':
        legAngle = legSwing;
        armAngle = armSwing;
        bodyOffsetY = bounceHeight / 2;
        headTilt = Math.sin(progress * Math.PI * 2) * 3;
        break;
      case 'running':
        legAngle = legSwing * 1.8;
        armAngle = armSwing * 1.8;
        bodyOffsetY = bounceHeight * 1.5;
        headTilt = Math.sin(progress * Math.PI * 2) * 5;
        facingAngle = 5; // Lean forward while running
        break;
      case 'idle':
        bodyOffsetY = breathe / 2;
        headTilt = Math.sin(progress * Math.PI) * 2;
        armAngle = Math.sin(progress * Math.PI) * 3;
        break;
      case 'attacking':
        armAngle = -45 + Math.sin(progress * Math.PI) * 40;
        rifleRotation = -20 + Math.sin(progress * Math.PI * 2) * 10;
        isAttacking = true;
        facingAngle = 10; // Lean forward when attacking
        headTilt = 5;
        break;
      case 'defending':
        armAngle = 30;
        bodyOffsetY = -5;
        isDefending = true;
        facingAngle = -10; // Lean backward when defending
        headTilt = -5;
        break;
      case 'throwing':
        armAngle = -90 + Math.sin(progress * Math.PI * 2) * 70;
        isThrowing = true;
        facingAngle = 15; // Lean forward when throwing
        headTilt = 10;
        break;
      case 'standing':
      default:
        bodyOffsetY = breathe;
        armAngle = Math.sin(progress * Math.PI * 2) * 2;
        headTilt = Math.sin(progress * Math.PI * 2) * 2;
        break;
    }

    // Helper function to draw rounded rectangles for smoother shapes
    const roundRect = (x: number, y: number, width: number, height: number, radius: number) => {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    };

    // Helper function to draw effects
    const drawEffect = (type: 'dust' | 'impact' | 'trail', x: number, y: number, size: number) => {
      switch (type) {
        case 'dust': {
          // Dust cloud for running
          ctx.save();
          ctx.globalAlpha = 0.5 * (1 - progress);
          for (let i = 0; i < 5; i++) {
            const angle = progress * Math.PI * 2 + i;
            const radius = size * (0.5 + progress * 0.5);
            ctx.fillStyle = '#D2C5B0';
            ctx.beginPath();
            ctx.arc(
              x + Math.cos(angle) * radius * 0.7,
              y + Math.sin(angle) * radius * 0.4,
              size * 0.3 * (1 - progress * 0.5),
              0,
              Math.PI * 2,
            );
            ctx.fill();
          }
          ctx.restore();
          break;
        }
        case 'impact': {
          // Impact effect for attacking
          ctx.save();
          ctx.globalAlpha = 0.7 * (1 - progress);
          ctx.strokeStyle = '#FFD700';
          ctx.lineWidth = 2;
          const impactSize = size * (0.5 + progress * 1.5);
          for (let i = 0; i < 8; i++) {
            const angle = ((Math.PI * 2) / 8) * i;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(angle) * impactSize, y + Math.sin(angle) * impactSize);
            ctx.stroke();
          }
          ctx.restore();
          break;
        }
        case 'trail': {
          // Motion trail
          ctx.save();
          ctx.globalAlpha = 0.3 * (1 - progress);
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - size * progress, y + size * 0.2 * Math.sin(progress * Math.PI * 4));
          ctx.stroke();
          ctx.restore();
          break;
        }
      }
    };

    // Apply body rotation based on facing angle
    ctx.save();
    ctx.translate(50, 50 + bodyOffsetY);
    ctx.rotate((facingAngle * Math.PI) / 180);
    ctx.translate(-50, -(50 + bodyOffsetY));

    // Draw legs with improved proportions
    ctx.save();
    ctx.translate(50, 70 + bodyOffsetY);

    // Left leg
    ctx.save();
    ctx.rotate((legAngle * Math.PI) / 180);

    // Boot with details
    ctx.fillStyle = bootColor;
    ctx.strokeStyle = outlineColor;
    roundRect(-6, 20, 16, 10, 2);
    ctx.fill();
    ctx.stroke();

    // Boot highlight
    ctx.fillStyle = bootHighlight;
    ctx.beginPath();
    ctx.rect(-3, 22, 10, 3);
    ctx.fill();

    // Leg with improved shape
    ctx.fillStyle = clothColor;
    roundRect(-5, 0, 10, 22, 2);
    ctx.fill();
    ctx.stroke();

    // Leg highlight
    ctx.fillStyle = clothHighlight;
    ctx.beginPath();
    ctx.rect(-2, 3, 4, 15);
    ctx.fill();

    ctx.restore();

    // Right leg
    ctx.save();
    ctx.rotate((-legAngle * Math.PI) / 180);

    // Boot with details
    ctx.fillStyle = bootColor;
    ctx.strokeStyle = outlineColor;
    roundRect(-6, 20, 16, 10, 2);
    ctx.fill();
    ctx.stroke();

    // Boot highlight
    ctx.fillStyle = bootHighlight;
    ctx.beginPath();
    ctx.rect(-3, 22, 10, 3);
    ctx.fill();

    // Leg with improved shape
    ctx.fillStyle = clothColor;
    roundRect(-5, 0, 10, 22, 2);
    ctx.fill();
    ctx.stroke();

    // Leg highlight
    ctx.fillStyle = clothHighlight;
    ctx.beginPath();
    ctx.rect(-2, 3, 4, 15);
    ctx.fill();

    ctx.restore();
    ctx.restore();

    // Draw dust clouds for running
    if (stance === 'running' && progress > 0.5) {
      drawEffect('dust', 40, 95, 10);
    }

    // Draw body with improved proportions
    ctx.fillStyle = clothColor;
    ctx.strokeStyle = outlineColor;
    roundRect(40, 40 + bodyOffsetY, 20, 30, 4);
    ctx.fill();
    ctx.stroke();

    // Body details - belt
    ctx.fillStyle = bootColor;
    ctx.beginPath();
    ctx.rect(38, 60 + bodyOffsetY, 24, 4);
    ctx.fill();
    ctx.stroke();

    // Body details - pocket
    ctx.fillStyle = clothHighlight;
    roundRect(42, 48 + bodyOffsetY, 7, 8, 1);
    ctx.fill();
    ctx.stroke();

    // Draw head with tilt
    ctx.save();
    ctx.translate(50, 30 + bodyOffsetY);
    ctx.rotate((headTilt * Math.PI) / 180);

    // Neck
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.rect(-3, -2, 6, 6);
    ctx.fill();
    ctx.stroke();

    // Head with improved shape
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(0, -10, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Face details - eyes
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(3, -12, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#2E2E2E';
    ctx.beginPath();
    ctx.arc(3, -12, 1, 0, Math.PI * 2);
    ctx.fill();

    // Face details - eyebrows
    ctx.strokeStyle = '#3E2E1E';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.quadraticCurveTo(3, -17, 6, -15);
    ctx.stroke();

    // Face details - mouth
    ctx.strokeStyle = '#3E2E1E';
    ctx.beginPath();

    // Different expressions based on stance
    if (stance === 'attacking' || stance === 'throwing') {
      // Determined expression
      ctx.moveTo(-2, -7);
      ctx.lineTo(4, -7);
    } else if (stance === 'running') {
      // Focused expression
      ctx.moveTo(-1, -7);
      ctx.lineTo(3, -7);
    } else {
      // Neutral/slight smile
      ctx.moveTo(-1, -7);
      ctx.quadraticCurveTo(1, -6, 3, -7);
    }

    ctx.stroke();

    // Draw hat with improved shape
    ctx.fillStyle = hatColor;
    ctx.beginPath();
    ctx.arc(0, -15, 9, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.rect(-10, -15, 20, 3);
    ctx.fill();
    ctx.stroke();

    // Hat details
    ctx.fillStyle = hatHighlight;
    ctx.beginPath();
    ctx.rect(-8, -15, 16, 1);
    ctx.fill();

    ctx.restore();

    // Draw arms with improved proportions
    ctx.save();
    ctx.translate(50, 45 + bodyOffsetY);

    // Left arm
    ctx.save();
    ctx.rotate((armAngle * Math.PI) / 180);

    // Upper arm
    ctx.fillStyle = clothColor;
    roundRect(-4, 0, 8, 15, 2);
    ctx.fill();
    ctx.stroke();

    // Arm highlight
    ctx.fillStyle = clothHighlight;
    ctx.beginPath();
    ctx.rect(-1, 2, 3, 10);
    ctx.fill();

    // Hand with details
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(0, 18, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Fingers
    ctx.fillStyle = skinShadow;
    ctx.beginPath();
    ctx.rect(-3, 16, 6, 1);
    ctx.fill();

    // Draw rifle if attacking with improved details
    if (isAttacking) {
      ctx.save();
      ctx.translate(0, 18);
      ctx.rotate((rifleRotation * Math.PI) / 180);

      // Rifle body
      ctx.fillStyle = rifleColor;
      roundRect(0, -3, 30, 6, 1);
      ctx.fill();
      ctx.stroke();

      // Rifle barrel
      ctx.fillStyle = '#555555';
      ctx.beginPath();
      ctx.rect(25, -1, 10, 2);
      ctx.fill();
      ctx.stroke();

      // Rifle handle
      ctx.fillStyle = rifleColor;
      roundRect(5, 3, 6, 10, 1);
      ctx.fill();
      ctx.stroke();

      // Rifle details
      ctx.fillStyle = rifleHighlight;
      ctx.beginPath();
      ctx.rect(8, -2, 15, 2);
      ctx.fill();

      // Trigger
      ctx.fillStyle = '#555555';
      ctx.beginPath();
      ctx.rect(10, 5, 2, 4);
      ctx.fill();
      ctx.stroke();

      // Draw impact effect when attacking
      if (progress > 0.7 && progress < 0.9) {
        drawEffect('impact', 40, 0, 15);
      }

      ctx.restore();
    }

    ctx.restore();

    // Right arm
    ctx.save();
    ctx.rotate((-armAngle * Math.PI) / 180);

    // Upper arm
    ctx.fillStyle = clothColor;
    roundRect(-4, 0, 8, 15, 2);
    ctx.fill();
    ctx.stroke();

    // Arm highlight
    ctx.fillStyle = clothHighlight;
    ctx.beginPath();
    ctx.rect(-1, 2, 3, 10);
    ctx.fill();

    // Hand with details
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(0, 18, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Fingers
    ctx.fillStyle = skinShadow;
    ctx.beginPath();
    ctx.rect(-3, 16, 6, 1);
    ctx.fill();

    // Draw shield if defending with improved details
    if (isDefending) {
      ctx.save();
      ctx.translate(0, 18);

      // Shield with gradient
      const shieldGradient = ctx.createLinearGradient(-5, -15, 15, 15);
      shieldGradient.addColorStop(0, '#8B4513');
      shieldGradient.addColorStop(0.5, '#A0522D');
      shieldGradient.addColorStop(1, '#CD853F');

      ctx.fillStyle = shieldGradient;
      ctx.beginPath();
      ctx.ellipse(5, 0, 12, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Shield emblem with details
      const emblemGradient = ctx.createRadialGradient(5, 0, 1, 5, 0, 7);
      emblemGradient.addColorStop(0, '#FFD700');
      emblemGradient.addColorStop(1, '#DAA520');

      ctx.fillStyle = emblemGradient;
      ctx.beginPath();
      ctx.arc(5, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Shield emblem details - lion silhouette
      ctx.fillStyle = '#8B4513';
      ctx.beginPath();
      ctx.moveTo(2, -2);
      ctx.lineTo(8, -2);
      ctx.lineTo(7, 2);
      ctx.lineTo(3, 2);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }

    // Draw throwing object with improved details
    if (isThrowing) {
      ctx.save();
      ctx.translate(0, 18);

      // Calculate throw position with improved arc
      const throwProgress = Math.max(0, Math.sin(progress * Math.PI));
      const throwX = throwProgress * 40;
      const throwY = throwProgress * -20 + throwProgress * throwProgress * 40;

      // Draw motion trail for the spear
      if (throwProgress > 0.2) {
        drawEffect('trail', throwX, throwY, 20);
      }

      // Throw object (spear) with improved details
      ctx.save();
      ctx.translate(throwX, throwY);
      ctx.rotate((45 * Math.PI) / 180);

      // Spear shaft with gradient
      const spearGradient = ctx.createLinearGradient(-2, -15, 2, 15);
      spearGradient.addColorStop(0, '#8B4513');
      spearGradient.addColorStop(0.5, '#A0522D');
      spearGradient.addColorStop(1, '#8B4513');

      ctx.fillStyle = spearGradient;
      roundRect(-2, -20, 4, 35, 1);
      ctx.fill();
      ctx.stroke();

      // Spear tip with metallic effect
      const tipGradient = ctx.createLinearGradient(-4, -25, 4, -15);
      tipGradient.addColorStop(0, '#A0A0A0');
      tipGradient.addColorStop(0.5, '#E0E0E0');
      tipGradient.addColorStop(1, '#A0A0A0');

      ctx.fillStyle = tipGradient;
      ctx.beginPath();
      ctx.moveTo(0, -25);
      ctx.lineTo(-5, -15);
      ctx.lineTo(5, -15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Spear binding details
      ctx.fillStyle = '#8B0000';
      ctx.beginPath();
      ctx.rect(-3, -15, 6, 2);
      ctx.fill();
      ctx.stroke();

      // Spear feather details
      ctx.fillStyle = '#DDDDDD';
      ctx.beginPath();
      ctx.moveTo(0, 15);
      ctx.lineTo(-4, 10);
      ctx.lineTo(0, 5);
      ctx.lineTo(4, 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
      ctx.restore();
    }

    ctx.restore();

    ctx.restore();

    ctx.restore(); // Restore body rotation

    // Restore the context state
    ctx.restore();
  },
};
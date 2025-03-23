import { Asset } from '../../../generator-core/src/assets-types';

export const Hunter2d: Asset = {
  name: 'hunter-2d',
  stances: ['standing', 'walking', 'running', 'idle', 'attacking', 'defending', 'reloading', 'sleeping', 'throwing'],
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
- reloading: Hunter is reloading the weapon
- throwing: Hunter throwing a spear or other projectile
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
    const breathe = Math.sin(progress * Math.PI * 2) * 1.5;

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
    let torsoTwist = 0; // Added for secondary motion in torso
    let shoulderOffset = 0; // Added for secondary motion in shoulders

    // Additional animation variables for improved walking/running
    let leftFootPlanted = false;
    let rightFootPlanted = false;
    let kneeFlexion = 0; // For more natural knee bending
    let weightShift = 0; // For lateral weight shifting
    let bodyLean = 0; // Forward/backward lean for momentum

    switch (stance) {
      case 'walking': {
        // Improved walking with foot planting and weight shifting
        const walkCycle = progress % 1;

        // Determine which foot is planted based on walk cycle
        leftFootPlanted = walkCycle < 0.5;
        rightFootPlanted = walkCycle >= 0.5;

        // More natural leg movement with proper foot planting
        legAngle = Math.sin(walkCycle * Math.PI * 2) * 15;

        // Add knee bend when leg is at extremes
        kneeFlexion = Math.abs(Math.sin(walkCycle * Math.PI * 2)) * 5;

        // Lateral weight shift based on which foot is planted
        weightShift = Math.sin(walkCycle * Math.PI * 2) * 2;

        // Arm swing with slight delay compared to legs for natural gait
        armAngle = Math.sin(walkCycle * Math.PI * 2 - Math.PI / 4) * 12;

        // Smoother up/down body movement - lower when both feet transitioning
        bodyOffsetY = Math.cos(walkCycle * Math.PI * 2) * 2;

        // Subtle forward lean for momentum
        bodyLean = 2;

        // Head and torso follow the body's movement
        headTilt = Math.sin(walkCycle * Math.PI * 2) * 2;
        torsoTwist = Math.sin(walkCycle * Math.PI * 2) * 2;
        shoulderOffset = Math.sin(walkCycle * Math.PI * 2) * 1.5;
        break;
      }

      case 'running': {
        // Improved running with exaggerated movements and proper foot planting
        const runCycle = progress % 1;

        // Determine which foot is planted based on run cycle
        leftFootPlanted = runCycle < 0.4; // Shorter ground contact time
        rightFootPlanted = runCycle >= 0.6;

        // More dynamic leg movement for running
        legAngle = Math.sin(runCycle * Math.PI * 2) * 30;

        // Exaggerated knee bend when leg is forward
        kneeFlexion = Math.abs(Math.sin(runCycle * Math.PI * 2)) * 15;

        // More pronounced lateral weight shift
        weightShift = Math.sin(runCycle * Math.PI * 2) * 4;

        // Arm swing with higher amplitude and opposite to legs
        armAngle = Math.sin(runCycle * Math.PI * 2 - Math.PI / 4) * 25;

        // More pronounced up/down body movement - "float" phase in mid-stride
        bodyOffsetY = Math.cos(runCycle * Math.PI * 2) * 4 - 2; // -2 gives a slight upward shift

        // Significant forward lean for speed
        bodyLean = 8;

        // Head and torso follow with more exaggerated movement
        headTilt = Math.sin(runCycle * Math.PI * 2) * 4;
        torsoTwist = Math.sin(runCycle * Math.PI * 2) * 4;
        shoulderOffset = Math.sin(runCycle * Math.PI * 2) * 3;
        break;
      }

      case 'idle':
        bodyOffsetY = breathe / 2;
        headTilt = Math.sin(progress * Math.PI) * 2;
        armAngle = Math.sin(progress * Math.PI) * 3;
        // Added subtle shifts for idle
        torsoTwist = Math.sin(progress * Math.PI * 0.5) * 1;
        shoulderOffset = Math.sin(progress * Math.PI * 0.5) * 0.8;
        break;

      case 'attacking': {
        // Improved attacking animation with proper anticipation and follow-through
        const attackCycle = progress % 1;

        // Three-phase attack: wind-up (0-0.3), strike (0.3-0.6), follow-through (0.6-1.0)
        if (attackCycle < 0.3) {
          // Wind-up phase - pulling back
          armAngle = -20 - attackCycle * 100; // Pull arm back
          rifleRotation = -10 - attackCycle * 30; // Angle rifle back
          bodyLean = -5 * (attackCycle / 0.3); // Slight backward lean
          torsoTwist = -10 * (attackCycle / 0.3); // Wind up torso
        } else if (attackCycle < 0.6) {
          // Strike phase - explosive forward movement
          const strikeProgress = (attackCycle - 0.3) / 0.3;
          armAngle = -50 + strikeProgress * 80; // Swing forward
          rifleRotation = -20 + strikeProgress * 40; // Swing rifle forward
          bodyLean = -5 + strikeProgress * 15; // Lean forward with strike
          torsoTwist = -10 + strikeProgress * 20; // Rotate torso with strike
        } else {
          // Follow-through phase
          const followProgress = (attackCycle - 0.6) / 0.4;
          armAngle = 30 - followProgress * 50; // Follow through and return
          rifleRotation = 20 - followProgress * 40; // Return rifle
          bodyLean = 10 - followProgress * 10; // Return to neutral
          torsoTwist = 10 - followProgress * 10; // Return torso
        }

        isAttacking = true;
        headTilt = 5;
        shoulderOffset = Math.sin(attackCycle * Math.PI) * 4;
        break;
      }
      case 'defending':
        armAngle = 30;
        bodyOffsetY = -5;
        isDefending = true;
        facingAngle = -10; // Lean backward when defending
        headTilt = -5;
        // Added defensive posture adjustment
        torsoTwist = -3;
        shoulderOffset = -2;
        break;
      case 'throwing': {
        // Improved throwing animation with better physics and body coordination
        const throwCycle = progress % 1;

        // Three-phase throw: preparation (0-0.3), throw (0.3-0.6), follow-through (0.6-1.0)
        if (throwCycle < 0.3) {
          // Preparation phase - winding up
          armAngle = -30 - throwCycle * 120; // Pull arm back further
          bodyLean = -5 * (throwCycle / 0.3); // Slight backward lean
          torsoTwist = -15 * (throwCycle / 0.3); // Wind up torso more
          headTilt = -5 * (throwCycle / 0.3); // Look at target
        } else if (throwCycle < 0.6) {
          // Throw phase - explosive forward movement
          const throwProgress = (throwCycle - 0.3) / 0.3;
          armAngle = -90 + throwProgress * 140; // Swing forward fast
          bodyLean = -5 + throwProgress * 20; // Lean forward with throw
          torsoTwist = -15 + throwProgress * 30; // Rotate torso with throw
          headTilt = -5 + throwProgress * 15; // Follow through with head
        } else {
          // Follow-through phase
          const followProgress = (throwCycle - 0.6) / 0.4;
          armAngle = 50 - followProgress * 70; // Follow through and return
          bodyLean = 15 - followProgress * 15; // Return to neutral
          torsoTwist = 15 - followProgress * 15; // Return torso
          headTilt = 10 - followProgress * 10; // Return head
        }

        isThrowing = true;
        shoulderOffset = Math.sin(throwCycle * Math.PI * 1.5) * 5;
        break;
      }

      case 'reloading': {
        // Improved reloading animation with detailed weapon handling
        const reloadCycle = progress % 1;

        // Four-phase reload: lower weapon (0-0.25), remove magazine (0.25-0.5),
        // insert magazine (0.5-0.75), ready weapon (0.75-1.0)
        if (reloadCycle < 0.25) {
          // Lower weapon phase
          armAngle = (-45 * reloadCycle) / 0.25;
          headTilt = (10 * reloadCycle) / 0.25; // Look down at weapon
        } else if (reloadCycle < 0.5) {
          // Remove magazine phase
          armAngle = -45;
          headTilt = 10;
          // Second hand movement implied by shoulder
          shoulderOffset = -3 * ((reloadCycle - 0.25) / 0.25);
        } else if (reloadCycle < 0.75) {
          // Insert magazine phase
          armAngle = -45;
          headTilt = 10;
          shoulderOffset = -3 + 5 * ((reloadCycle - 0.5) / 0.25); // Move hand back up
        } else {
          // Ready weapon phase
          armAngle = -45 + 45 * ((reloadCycle - 0.75) / 0.25); // Raise weapon
          headTilt = 10 - 10 * ((reloadCycle - 0.75) / 0.25); // Look back up
          shoulderOffset = 2 - 2 * ((reloadCycle - 0.75) / 0.25); // Return to neutral
        }

        // Add subtle body movements
        bodyOffsetY = Math.sin(reloadCycle * Math.PI * 2) * 1;
        torsoTwist = Math.sin(reloadCycle * Math.PI) * 2;
        break;
      }

      case 'sleeping':
        // New sleeping animation
        // Hunter lying down with subtle breathing
        bodyOffsetY = 30; // Lowered body position
        bodyLean = 80; // Almost horizontal
        headTilt = 20; // Head resting
        legAngle = -80; // Legs extended
        armAngle = 100; // Arms relaxed

        // Subtle breathing movement
        torsoTwist = Math.sin(progress * Math.PI) * 1;
        shoulderOffset = Math.sin(progress * Math.PI) * 0.5;
        break;

      case 'standing':
      default: {
        // Enhanced standing animation with more natural subtle movements
        const standCycle = progress % 1;

        // Subtle weight shifting from one foot to another
        weightShift = Math.sin(standCycle * Math.PI * 0.5) * 1; // Slower, subtle shift

        // Subtle breathing
        bodyOffsetY = Math.sin(standCycle * Math.PI * 0.7) * 0.8; // Slower, subtle breathing

        // Occasional subtle movements
        if (standCycle < 0.1 || (standCycle > 0.5 && standCycle < 0.6)) {
          // Subtle head movement like looking around
          headTilt = Math.sin(standCycle * Math.PI * 10) * 1.5;
        } else {
          headTilt = Math.sin(standCycle * Math.PI * 0.5) * 0.8;
        }

        // Subtle arm and shoulder adjustments
        armAngle = Math.sin(standCycle * Math.PI * 0.3) * 1.5;
        shoulderOffset = Math.sin(standCycle * Math.PI * 0.4) * 0.5;
        torsoTwist = Math.sin(standCycle * Math.PI * 0.3) * 0.5;
        break;
      }
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
          // Enhanced dust cloud for running with better particle distribution
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
          // Enhanced motion trail with better fade
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

    // Apply body rotation and lean based on stance
    ctx.save();
    // Apply weightShift for more natural weight distribution
    ctx.translate(50 + weightShift, 50 + bodyOffsetY);
    // Apply bodyLean for momentum and stance-appropriate posture
    ctx.rotate(((facingAngle + bodyLean) * Math.PI) / 180);
    // Apply torso twist for more natural movement
    ctx.rotate((torsoTwist * Math.PI) / 180);
    ctx.translate(-50, -(50 + bodyOffsetY));

    // Draw legs with improved proportions and dynamics
    ctx.save();
    ctx.translate(50, 70 + bodyOffsetY);

    // Left leg with improved knee bend and foot planting
    ctx.save();
    // Base leg angle
    ctx.rotate((legAngle * Math.PI) / 180);

    // Add knee bend when leg is forward (improved natural movement)
    if (legAngle > 0) {
      // Draw upper leg
      ctx.fillStyle = clothColor;
      roundRect(-5, 0, 10, 12, 2);
      ctx.fill();
      ctx.stroke();

      // Draw lower leg with knee bend
      ctx.save();
      ctx.translate(0, 12);
      ctx.rotate((kneeFlexion * Math.PI) / 180);

      // Lower leg with improved shape
      ctx.fillStyle = clothColor;
      roundRect(-5, 0, 10, 10, 2);
      ctx.fill();
      ctx.stroke();

      // Leg highlight
      ctx.fillStyle = clothHighlight;
      ctx.beginPath();
      ctx.rect(-2, 3, 4, 5);
      ctx.fill();

      // Boot with details
      ctx.fillStyle = bootColor;
      ctx.strokeStyle = outlineColor;
      roundRect(-6, 10, 16, 10, 2);
      ctx.fill();
      ctx.stroke();

      // Boot highlight
      ctx.fillStyle = bootHighlight;
      ctx.beginPath();
      ctx.rect(-3, 12, 10, 3);
      ctx.fill();

      ctx.restore();
    } else {
      // Straight leg when back or planted
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
    }

    // Add subtle foot planting effect
    if (leftFootPlanted && stance !== 'sleeping') {
      // Subtle shadow beneath planted foot
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.beginPath();
      ctx.ellipse(0, 30, 10, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Right leg with improved knee bend and foot planting
    ctx.save();
    // Base leg angle - opposite of left leg
    ctx.rotate((-legAngle * Math.PI) / 180);

    // Add knee bend when leg is forward (improved natural movement)
    if (-legAngle > 0) {
      // Draw upper leg
      ctx.fillStyle = clothColor;
      roundRect(-5, 0, 10, 12, 2);
      ctx.fill();
      ctx.stroke();

      // Draw lower leg with knee bend
      ctx.save();
      ctx.translate(0, 12);
      ctx.rotate((kneeFlexion * Math.PI) / 180);

      // Lower leg with improved shape
      ctx.fillStyle = clothColor;
      roundRect(-5, 0, 10, 10, 2);
      ctx.fill();
      ctx.stroke();

      // Leg highlight
      ctx.fillStyle = clothHighlight;
      ctx.beginPath();
      ctx.rect(-2, 3, 4, 5);
      ctx.fill();

      // Boot with details
      ctx.fillStyle = bootColor;
      ctx.strokeStyle = outlineColor;
      roundRect(-6, 10, 16, 10, 2);
      ctx.fill();
      ctx.stroke();

      // Boot highlight
      ctx.fillStyle = bootHighlight;
      ctx.beginPath();
      ctx.rect(-3, 12, 10, 3);
      ctx.fill();

      ctx.restore();
    } else {
      // Straight leg when back or planted
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
    }

    // Add subtle foot planting effect
    if (rightFootPlanted && stance !== 'sleeping') {
      // Subtle shadow beneath planted foot
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.beginPath();
      ctx.ellipse(0, 30, 10, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    ctx.restore();

    // Draw dust clouds for running with improved timing
    if (stance === 'running') {
      if (leftFootPlanted) {
        drawEffect('dust', 40, 95, 10);
      } else if (rightFootPlanted) {
        drawEffect('dust', 60, 95, 10);
      }
    }
    // Draw body with improved proportions and stance-specific adjustments
    ctx.fillStyle = clothColor;
    ctx.strokeStyle = outlineColor;

    // Adjust torso shape based on stance
    if (stance === 'sleeping') {
      // Elongated horizontal torso for sleeping
      roundRect(35, 40 + bodyOffsetY, 30, 15, 4);
    } else {
      roundRect(40, 40 + bodyOffsetY, 20, 30, 4);
    }
    ctx.fill();
    ctx.stroke();

    // Body details - belt
    ctx.fillStyle = bootColor;
    ctx.beginPath();
    if (stance === 'sleeping') {
      ctx.rect(35, 50 + bodyOffsetY, 30, 4);
    } else {
      ctx.rect(38, 60 + bodyOffsetY, 24, 4);
    }
    ctx.fill();
    ctx.stroke();

    // Body details - pocket
    ctx.fillStyle = clothHighlight;
    if (stance === 'sleeping') {
      roundRect(42, 43 + bodyOffsetY, 7, 5, 1);
    } else {
      roundRect(42, 48 + bodyOffsetY, 7, 8, 1);
    }
    ctx.fill();
    ctx.stroke();
    // Draw head with improved tilt and connection to body
    ctx.save();
    // Adjusted head position to connect with the body with better neck articulation
    ctx.translate(50, 35 + bodyOffsetY);
    ctx.rotate((headTilt * Math.PI) / 180);

    // Enhanced neck with better connection to body
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.rect(-3, -2, 6, 5);
    ctx.fill();
    ctx.stroke();

    // Head with improved shape
    ctx.fillStyle = skinColor;
    ctx.beginPath();
    ctx.arc(0, -10, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Enhanced face details with more expressive eyes
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(3, -12, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // More expressive eyes based on stance
    if (stance === 'attacking' || stance === 'throwing') {
      // Focused, determined eyes
      ctx.fillStyle = '#2E2E2E';
      ctx.beginPath();
      ctx.arc(3, -12, 1.2, 0, Math.PI * 2); // Slightly larger pupils for intensity
      ctx.fill();
    } else if (stance === 'running') {
      // Alert eyes
      ctx.fillStyle = '#2E2E2E';
      ctx.beginPath();
      ctx.arc(3.5, -12, 1, 0, Math.PI * 2); // Pupils shifted slightly for direction
      ctx.fill();
    } else if (stance === 'sleeping') {
      // Closed eyes
      ctx.strokeStyle = '#3E2E1E';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.quadraticCurveTo(3, -13, 6, -12);
      ctx.stroke();
    } else {
      // Default eyes
      ctx.fillStyle = '#2E2E2E';
      ctx.beginPath();
      ctx.arc(3, -12, 1, 0, Math.PI * 2);
      ctx.fill();
    }

    // Enhanced eyebrows with more expression
    ctx.strokeStyle = '#3E2E1E';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    if (stance === 'attacking' || stance === 'throwing') {
      // Furrowed, determined eyebrows
      ctx.moveTo(0, -16);
      ctx.quadraticCurveTo(3, -15, 6, -16);
    } else if (stance === 'defending') {
      // Worried eyebrows
      ctx.moveTo(0, -14);
      ctx.quadraticCurveTo(3, -16, 6, -14);
    } else if (stance === 'sleeping') {
      // Relaxed eyebrows - not visible
    } else if (stance === 'running') {
      // Alert eyebrows
      ctx.moveTo(0, -15);
      ctx.quadraticCurveTo(3, -17, 6, -15);
    } else {
      // Default eyebrows
      ctx.moveTo(0, -15);
      ctx.quadraticCurveTo(3, -17, 6, -15);
    }
    ctx.stroke();

    // Enhanced mouth with more varied expressions
    ctx.strokeStyle = '#3E2E1E';
    ctx.beginPath();

    // Different expressions based on stance for more personality
    if (stance === 'attacking') {
      // Determined, teeth-gritted expression
      ctx.moveTo(-2, -7);
      ctx.lineTo(4, -7);
      // Add teeth detail
      ctx.moveTo(-1, -7);
      ctx.lineTo(-1, -6);
      ctx.moveTo(1, -7);
      ctx.lineTo(1, -6);
      ctx.moveTo(3, -7);
      ctx.lineTo(3, -6);
    } else if (stance === 'throwing') {
      // Open mouth with effort
      ctx.moveTo(-1, -7);
      ctx.quadraticCurveTo(1, -5, 3, -7);
    } else if (stance === 'running') {
      // Slightly open mouth, breathing
      ctx.moveTo(-1, -7);
      ctx.quadraticCurveTo(1, -6, 3, -7);
    } else if (stance === 'defending') {
      // Concerned expression
      ctx.moveTo(-1, -6);
      ctx.quadraticCurveTo(1, -7, 3, -6);
    } else if (stance === 'sleeping') {
      // Peaceful, slightly open mouth
      ctx.moveTo(0, -6);
      ctx.quadraticCurveTo(2, -5, 4, -6);
    } else if (stance === 'idle' || stance === 'standing') {
      // Relaxed, slight smile
      ctx.moveTo(-1, -7);
      ctx.quadraticCurveTo(1, -6, 3, -7);
    } else {
      // Default neutral expression
      ctx.moveTo(-1, -7);
      ctx.lineTo(3, -7);
    }
    ctx.stroke();

    // Draw hat with improved shape and fit
    if (stance !== 'sleeping') {
      // Regular hat position
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
    } else {
      // Hat placed beside head for sleeping
      ctx.fillStyle = hatColor;
      ctx.beginPath();
      ctx.arc(15, -5, 9, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.rect(5, -5, 20, 3);
      ctx.fill();
      ctx.stroke();

      // Hat details
      ctx.fillStyle = hatHighlight;
      ctx.beginPath();
      ctx.rect(7, -5, 16, 1);
      ctx.fill();
    }

    ctx.restore();
    // Draw arms with improved proportions and secondary motion
    ctx.save();
    // Apply shoulder offset for more natural movement
    ctx.translate(50 + shoulderOffset * 0.5, 45 + bodyOffsetY);

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

      // Draw impact effect when attacking with anticipation and follow-through
      const attackCycle = progress % 1;
      if (attackCycle > 0.3 && attackCycle < 0.6) {
        // Only show impact during strike phase
        const strikeProgress = (attackCycle - 0.3) / 0.3;
        if (strikeProgress > 0.7) {
          // Near end of strike
          drawEffect('impact', 40, 0, 15);
        }
      }

      ctx.restore();
    }

    ctx.restore();

    // Right arm with shoulder offset for secondary motion
    ctx.save();
    ctx.translate(shoulderOffset * -0.5, 0); // Apply offset to right shoulder
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

    // Draw throwing object with improved details and animation
    if (isThrowing) {
      ctx.save();
      ctx.translate(0, 18);

      // Improved throw animation with better anticipation and follow-through
      const throwCycle = progress % 1;
      let throwProgress = 0;
      let throwX = 0;
      let throwY = 0;

      // Improved throwing animation with anticipation
      if (throwCycle < 0.3) {
        // Anticipation phase - draw back
        throwProgress = throwCycle / 0.3;
        throwX = -10 * throwProgress;
        throwY = -5 * throwProgress;
      } else if (throwCycle < 0.6) {
        // Throw phase
        throwProgress = (throwCycle - 0.3) / 0.3;
        throwX = -10 + throwProgress * 50;
        throwY = -5 + throwProgress * -15 + throwProgress * throwProgress * 40;
      } else {
        // Follow-through phase
        throwProgress = (throwCycle - 0.6) / 0.4;
        throwX = 40 + throwProgress * 10;
        throwY = 20 + throwProgress * 10;
      }

      // Draw motion trail for the spear
      if (throwCycle > 0.3 && throwCycle < 0.6) {
        drawEffect('trail', throwX, throwY, 20);
      }

      // Throw object (spear) with improved details
      ctx.save();
      ctx.translate(throwX, throwY);

      // Adjust rotation based on throw phase for more natural movement
      let spearRotation = 45;
      if (throwCycle < 0.3) {
        spearRotation = 30 - throwCycle * 60; // Rotate back during anticipation
      } else if (throwCycle < 0.6) {
        spearRotation = -30 + (throwCycle - 0.3) * 200; // Rotate forward during throw
      } else {
        spearRotation = 50 + (throwCycle - 0.7) * 30; // Slight adjustment in follow-through
      }

      ctx.rotate((spearRotation * Math.PI) / 180);

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

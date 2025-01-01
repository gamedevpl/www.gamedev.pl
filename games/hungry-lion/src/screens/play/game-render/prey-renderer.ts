import { PreyState } from '../game-world/prey-types';
import { devConfig } from '../dev/dev-config';

export function renderPrey(ctx: CanvasRenderingContext2D, prey: PreyState) {
  ctx.save();
  ctx.translate(prey.position.x, prey.position.y);

  // Calculate rotation angle based on movement direction
  const angle = Math.atan2(prey.movement.direction.y, prey.movement.direction.x);
  ctx.rotate(angle);

  // Add slight wobble effect for fleeing state
  if (prey.state === 'fleeing') {
    const wobble = Math.sin(Date.now() / 100) * 0.1;
    ctx.rotate(wobble);
  }

  // Draw vision cone
  ctx.beginPath();
  ctx.moveTo(0, 0);
  const visionLength = 20;
  ctx.lineTo(
    visionLength * Math.cos(-0.3),
    visionLength * Math.sin(-0.3)
  );
  ctx.lineTo(
    visionLength * Math.cos(0.3),
    visionLength * Math.sin(0.3)
  );
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 255, 0, 0.1)';
  ctx.fill();

  // Draw prey body with state-dependent colors and effects
  ctx.beginPath();
  ctx.rect(-15, -15, 30, 30);

  // Dynamic color based on state
  let color;
  if (prey.state === 'fleeing') {
    // Pulsing red effect for fleeing
    const pulseIntensity = Math.sin(Date.now() / 100) * 0.3 + 0.7;
    color = `rgba(255, 0, 0, ${pulseIntensity})`;
  } else if (prey.state === 'moving') {
    color = 'rgba(255, 200, 0, 0.8)'; // Yellow for moving
  } else {
    color = 'rgba(0, 200, 0, 0.8)'; // Green for idle
  }
  
  ctx.fillStyle = color;
  ctx.fill();
  
  // Add border with state-dependent style
  ctx.strokeStyle = prey.state === 'fleeing' ? 'darkred' : 'black';
  ctx.lineWidth = prey.state === 'fleeing' ? 3 : 2;
  ctx.stroke();

  // Draw eyes to indicate direction
  const eyeOffset = prey.state === 'fleeing' ? 8 : 10; // Eyes move back when fleeing
  const eyeSize = prey.state === 'fleeing' ? 4 : 3; // Larger eyes when fleeing
  
  ctx.beginPath();
  ctx.arc(eyeOffset, -5, eyeSize, 0, Math.PI * 2);
  ctx.arc(eyeOffset, 5, eyeSize, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Add pupils that follow movement direction
  const pupilOffset = prey.state === 'fleeing' ? 1.5 : 1;
  ctx.beginPath();
  ctx.arc(eyeOffset + pupilOffset, -5, eyeSize/2, 0, Math.PI * 2);
  ctx.arc(eyeOffset + pupilOffset, 5, eyeSize/2, 0, Math.PI * 2);
  ctx.fillStyle = 'black';
  ctx.fill();

  // Debug rendering for fleeing state in dev mode
  if (devConfig.debugFleeingState && prey.state === 'fleeing') {
    ctx.save();
    ctx.rotate(-angle); // Reset rotation for text
    ctx.font = '12px Arial';
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 1;
    
    // Display remaining fleeing time
    if (prey.fleeingUntil) {
      const remainingTime = Math.max(0, prey.fleeingUntil - Date.now());
      ctx.fillText(`Fleeing: ${(remainingTime / 1000).toFixed(1)}s`, 20, -20);
      ctx.strokeText(`Fleeing: ${(remainingTime / 1000).toFixed(1)}s`, 20, -20);
    }

    // Display safe distance condition
    ctx.fillText(`Safe: ${prey.safeDistanceReached ? 'Yes' : 'No'}`, 20, -5);
    ctx.strokeText(`Safe: ${prey.safeDistanceReached ? 'Yes' : 'No'}`, 20, -5);

    ctx.restore();
  }

  ctx.restore();
}

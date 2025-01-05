// import { devConfig } from '../dev/dev-config';
import { PreyEntity } from '../../game-world/entities-types';

export function renderPrey(ctx: CanvasRenderingContext2D, prey: PreyEntity) {
  ctx.save();
  ctx.translate(prey.position.x, prey.position.y);

  // Calculate rotation angle based on movement direction
  ctx.rotate(prey.direction);

  // Add slight wobble effect for fleeing state
  if (prey.state === 'fleeing') {
    const wobble = Math.sin(Date.now() / 100) * 0.1;
    ctx.rotate(wobble);
  }

  // Draw vision cone
  ctx.beginPath();
  ctx.moveTo(0, 0);
  const visionLength = 20;
  ctx.lineTo(visionLength * Math.cos(-0.3), visionLength * Math.sin(-0.3));
  ctx.lineTo(visionLength * Math.cos(0.3), visionLength * Math.sin(0.3));
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 255, 0, 0.1)';
  ctx.fill();

  // Draw prey body with state-dependent colors and effects
  ctx.beginPath();
  ctx.rect(-15, -15, 30, 30);

  // Dynamic color based on state and health
  const healthPercentage = prey.health / 100;
  let color = `rgba(0, 200, 0, ${healthPercentage})`;
  if (prey.state === 'fleeing') {
    // Pulsing red effect for fleeing
    const pulseIntensity = Math.sin(Date.now() / 100) * 0.3 + 0.7;
    color = `rgba(255, 0, 0, ${pulseIntensity * healthPercentage})`;
  } else if (prey.state === 'moving') {
    color = `rgba(255, 200, 0, ${0.8 * healthPercentage})`;
  }

  ctx.fillStyle = color;
  ctx.fill();

  // Add border with state-dependent style
  ctx.strokeStyle = prey.state === 'fleeing' ? 'darkred' : 'black';
  ctx.lineWidth = prey.state === 'fleeing' ? 3 : 2;
  ctx.stroke();

  // Draw eyes to indicate direction
  const eyeOffset = 10;
  const eyeSize = 3;

  ctx.beginPath();
  ctx.arc(eyeOffset, -5, eyeSize, 0, Math.PI * 2);
  ctx.arc(eyeOffset, 5, eyeSize, 0, Math.PI * 2);
  ctx.fillStyle = 'white';
  ctx.fill();
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Add pupils that follow movement direction
  const pupilOffset = 1;
  ctx.beginPath();
  ctx.arc(eyeOffset + pupilOffset, -5, eyeSize / 2, 0, Math.PI * 2);
  ctx.arc(eyeOffset + pupilOffset, 5, eyeSize / 2, 0, Math.PI * 2);
  ctx.fillStyle = 'black';
  ctx.fill();

  // Reset rotation for debug text
  ctx.rotate(-prey.direction);

  ctx.restore();
}

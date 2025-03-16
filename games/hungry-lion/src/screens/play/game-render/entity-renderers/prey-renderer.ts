import { PreyEntity } from '../../game-world/entities/entities-types';

import {Prey2d} from '../../../../../../../tools/asset-generator/generator-assets/src/prey-2d/prey-2d'

// Constants for rendering
// const CRITICAL_HUNGER = 20;
// const CRITICAL_THIRST = 15;

export function renderPrey(ctx: CanvasRenderingContext2D, prey: PreyEntity) {
  let stance;
  if (prey.stateMachine[0] === 'PREY_MOVING') {
    stance = 'running';
  // } else if (prey.stateMachine[0] === 'PREY_EATING') {
  //   stance = 'eating';
  // } else if (prey.stateMachine[0] === 'PREY_DRINKING') {
  //   stance = 'drinking';
  } else {
    stance = 'standing';
  }

  Prey2d.render(ctx, prey.position.x, prey.position.y, 40, 40, Date.now() % 1000 / 1000, stance, prey.velocity.x < 0 ? 'left' : 'right');
  // ctx.save();
  // ctx.translate(prey.position.x, prey.position.y);

  // // Calculate rotation angle based on movement direction
  // ctx.rotate(prey.direction);

  // // Add slight wobble effect for fleeing state
  // if (prey.stateMachine[0] === 'PREY_FLEEING') {
  //   const wobble = Math.sin(Date.now() / 100) * 0.1;
  //   ctx.rotate(wobble);
  // }

  // // Draw vision cone
  // ctx.beginPath();
  // ctx.moveTo(0, 0);
  // const visionLength = 20;
  // ctx.lineTo(visionLength * Math.cos(-0.3), visionLength * Math.sin(-0.3));
  // ctx.lineTo(visionLength * Math.cos(0.3), visionLength * Math.sin(0.3));
  // ctx.closePath();
  // ctx.fillStyle = 'rgba(255, 255, 0, 0.1)';
  // ctx.fill();

  // // Draw prey body with state-dependent colors and effects
  // ctx.beginPath();
  // ctx.rect(-15, -15, 30, 30);

  // // Dynamic color based on state, health, and survival needs
  // const healthPercentage = prey.health / 100;
  // let color: string;

  // if (prey.stateMachine[0] === 'PREY_FLEEING') {
  //   // Pulsing red effect for fleeing
  //   const pulseIntensity = Math.sin(Date.now() / 100) * 0.3 + 0.7;
  //   color = `rgba(255, 0, 0, ${pulseIntensity * healthPercentage})`;
  // } else if (prey.stateMachine[0] === 'PREY_EATING') {
  //   // Green pulsing effect while eating
  //   const eatPulse = Math.sin(Date.now() / 200) * 0.2 + 0.8;
  //   color = `rgba(0, 255, 0, ${eatPulse * healthPercentage})`;
  // } else if (prey.stateMachine[0] === 'PREY_DRINKING') {
  //   // Blue pulsing effect while drinking
  //   const drinkPulse = Math.sin(Date.now() / 200) * 0.2 + 0.8;
  //   color = `rgba(0, 191, 255, ${drinkPulse * healthPercentage})`;
  // } else if (prey.hungerLevel <= CRITICAL_HUNGER || prey.thirstLevel <= CRITICAL_THIRST) {
  //   // Yellowish color for critical needs
  //   color = `rgba(255, 191, 0, ${healthPercentage})`;
  // } else if (prey.stateMachine[0] === 'PREY_MOVING') {
  //   color = `rgba(255, 200, 0, ${0.8 * healthPercentage})`;
  // } else {
  //   color = `rgba(0, 200, 0, ${healthPercentage})`;
  // }

  // ctx.fillStyle = color;
  // ctx.fill();

  // // Add border with state-dependent style
  // ctx.strokeStyle = prey.stateMachine[0] === 'PREY_FLEEING' ? 'darkred' : 'black';
  // ctx.lineWidth = prey.stateMachine[0] === 'PREY_FLEEING' ? 3 : 2;
  // ctx.stroke();

  // // Draw eyes to indicate direction
  // const eyeOffset = 10;
  // const eyeSize = 3;

  // ctx.beginPath();
  // ctx.arc(eyeOffset, -5, eyeSize, 0, Math.PI * 2);
  // ctx.arc(eyeOffset, 5, eyeSize, 0, Math.PI * 2);
  // ctx.fillStyle = 'white';
  // ctx.fill();
  // ctx.strokeStyle = 'black';
  // ctx.lineWidth = 1;
  // ctx.stroke();

  // // Add pupils that follow movement direction
  // const pupilOffset = 1;
  // ctx.beginPath();
  // ctx.arc(eyeOffset + pupilOffset, -5, eyeSize / 2, 0, Math.PI * 2);
  // ctx.arc(eyeOffset + pupilOffset, 5, eyeSize / 2, 0, Math.PI * 2);
  // ctx.fillStyle = 'black';
  // ctx.fill();

  // // Add eating/drinking animation effects
  // if (prey.stateMachine[0] === 'PREY_EATING') {
  //   // Draw munching animation
  //   const munchPhase = Math.sin(Date.now() / 100);
  //   ctx.beginPath();
  //   ctx.arc(0, 0, 5, 0, Math.PI * munchPhase);
  //   ctx.strokeStyle = 'green';
  //   ctx.lineWidth = 2;
  //   ctx.stroke();
  // } else if (prey.stateMachine[0] === 'PREY_DRINKING') {
  //   // Draw drinking ripples
  //   const ripplePhase = Date.now() / 200;
  //   for (let i = 0; i < 3; i++) {
  //     const radius = ((ripplePhase + i * 2) % 6) + 2;
  //     ctx.beginPath();
  //     ctx.arc(0, 0, radius, 0, Math.PI * 2);
  //     ctx.strokeStyle = `rgba(0, 191, 255, ${0.5 - radius / 12})`;
  //     ctx.lineWidth = 1;
  //     ctx.stroke();
  //   }
  // }

  // ctx.restore();
}

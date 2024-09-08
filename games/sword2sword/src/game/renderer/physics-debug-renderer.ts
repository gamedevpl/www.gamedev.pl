import * as Matter from 'matter-js';
import { PhysicsState } from '../physics/physics-types';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from './renderer';

let matterRender: Matter.Render;

export function renderPhysicsDebug(container: HTMLDivElement, physicsState: PhysicsState) {
  if (!matterRender) {
    initMatterRender(container, physicsState.engine);
  } else if (matterRender.canvas.parentElement !== container) {
    container.appendChild(matterRender.canvas);
  }

  Matter.Render.world(matterRender);
}

function initMatterRender(container: HTMLDivElement, engine: Matter.Engine) {
  matterRender = Matter.Render.create({
    element: container, // The HTML element to append the canvas to
    engine: engine, // The Matter.js engine
    options: {
      width: SCREEN_WIDTH, // Canvas width
      height: SCREEN_HEIGHT, // Canvas height
      wireframes: true, // Disable wireframe mode for a solid fill color
      showVelocity: true,
      background: 'rgba(0, 0, 0, 0)',
      wireframeBackground: 'rgba(0, 0, 0, 0)',
      showCollisions: true,
    },
  });
}

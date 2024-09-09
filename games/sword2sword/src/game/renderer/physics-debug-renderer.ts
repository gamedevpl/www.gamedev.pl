// import * as planck from 'planck';
import { PhysicsState /*, Body*/ } from '../physics/physics-types';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from './renderer';

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;

export function renderPhysicsDebug(container: HTMLDivElement, _physicsState: PhysicsState) {
  if (!canvas) {
    initCanvas(container);
  } else if (canvas.parentElement !== container) {
    container.appendChild(canvas);
  }

  // Clear the canvas
  ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

  // Set styles
  ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
  ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
  ctx.lineWidth = 2;

  // Render bodies
  //   for (let body = physicsState.world.getBodyList(), body)
  //   physicsState.world.getBodyList().forEach((body) => {
  //     renderBody(body);
  //   });

  // Render joints (if needed)
  // TODO: Implement joint rendering if required
}

function initCanvas(container: HTMLDivElement) {
  canvas = document.createElement('canvas');
  canvas.width = SCREEN_WIDTH;
  canvas.height = SCREEN_HEIGHT;
  container.appendChild(canvas);

  ctx = canvas.getContext('2d')!;
}

// function renderBody(body: Body) {
//   const position = body.getPosition();
//   ctx.save();
//   ctx.translate(position.x, position.y);
//   ctx.rotate(body.getAngle());

//   for (let fixture = body.getFixtureList(); fixture; fixture = fixture.getNext()) {
//     const shape = fixture.getShape();
//     if (shape.getType() === 'circle') {
//       renderCircle(shape as planck.CircleShape);
//     } else if (shape.getType() === 'polygon') {
//       renderPolygon(shape as planck.PolygonShape);
//     }
//     // Add more shape types if needed
//   }

//   ctx.restore();
// }

// function renderCircle(circle: planck.CircleShape) {
//   const radius = circle.getRadius();
//   ctx.beginPath();
//   ctx.arc(0, 0, radius, 0, 2 * Math.PI);
//   ctx.fill();
//   ctx.stroke();
// }

// function renderPolygon(polygon: planck.PolygonShape) {
//   const vertices = polygon.m_vertices;
//   ctx.beginPath();
//   ctx.moveTo(vertices[0].x, vertices[0].y);
//   for (let i = 1; i < vertices.length; i++) {
//     ctx.lineTo(vertices[i].x, vertices[i].y);
//   }
//   ctx.closePath();
//   ctx.fill();
//   ctx.stroke();
// }

// Function to clean up debug renderer resources
export function cleanupDebugRenderer() {
  if (canvas && canvas.parentElement) {
    canvas.parentElement.removeChild(canvas);
  }
  canvas = null as unknown as HTMLCanvasElement;
  ctx = null as unknown as CanvasRenderingContext2D;
}

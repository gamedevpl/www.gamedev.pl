import { getCanvas } from '../util/canvas';
import { LAYER_DEFAULT } from '../consts';
import { GameWorld } from './game-world';
import { RenderQueue } from './game-render-queue';

export function renderGame(world: GameWorld) {
  const canvas = getCanvas(LAYER_DEFAULT);
  const renderQueue = new RenderQueue();

  // clear
  canvas.clear();

  // render terrain
  world.terrain.render(canvas);

  // set camera
  canvas.save().translate(canvas.getWidth() / 2, canvas.getHeight() / 2);

  // Render dead particles from the offscreen canvas
  world.particles.renderDead(canvas);

  // render other objects
  world.objects.forEach((object) => object.render(renderQueue));

  // Render active particles
  world.particles.addRenderCommands(renderQueue);

  // Render all queued commands
  renderQueue.render(canvas);

  canvas.restore();
}

import { getCanvas } from '../util/canvas';
import { LAYER_DEFAULT } from '../consts';
import { GameWorld } from './game-world';
import { GameObject } from './objects/game-object';
import { SoldierObject } from './objects/object-soldier';

export function renderGame(world: GameWorld) {
  /** {Canvas} */
  var canvas = getCanvas(LAYER_DEFAULT);

  // clear
  canvas.clear();

  // set camera
  canvas.save().translate(canvas.getWidth() / 2, canvas.getHeight() / 2);

  // Render dead particles from the offscreen canvas
  world.particles.renderDead(canvas);

  // render dead bodies
  world.queryObjects('Soldier', (soldier: SoldierObject) => soldier.state.life === 0).forEach(renderObject);

  // render soldiers
  world.queryObjects('Soldier', (soldier: SoldierObject) => soldier.state.life > 0).forEach(renderObject);

  // render other objects
  world.queryObjects('Arrow').forEach(renderObject);
  world.queryObjects('Explosion').forEach(renderObject);

  // Render active particles
  world.particles.renderActive(canvas);

  canvas.restore();
}

/**
 * @param {GameObject} object
 */
export function renderObject(object: GameObject) {
  var canvas = getCanvas(LAYER_DEFAULT);

  canvas.save().fillStyle('red').translate(object.getX(), object.getY()).rotate(object.getDirection());
  object.render(canvas);
  canvas.restore();
  // if (object.enemy && object.life > 0) {
  //     canvas.strokeStyle(object.color);
  //     canvas.line(object.getX(), object.getY(), object.enemy.getX(), object.enemy.getY());
  // }
}

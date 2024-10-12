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

  // render terrain
  world.terrain.render(canvas);

  // set camera
  canvas.save().translate(canvas.getWidth() / 2, canvas.getHeight() / 2);

  // Render dead particles from the offscreen canvas
  world.particles.renderDead(canvas);

  // render dead bodies
  world
    .queryObjects('Soldier', (soldier: SoldierObject) => soldier.state.life === 0)
    .forEach((soldier) => renderObject(soldier, world));

  // render soldiers
  world
    .queryObjects('Soldier', (soldier: SoldierObject) => soldier.state.life > 0)
    .sort((a, b) => a.getY() - b.getY())
    .forEach((soldier) => renderObject(soldier, world));

  // render other objects
  world.queryObjects('Arrow').forEach((arrow) => renderObject(arrow, world));
  world.queryObjects('Explosion').forEach((explosion) => renderObject(explosion, world));

  // Render active particles
  world.particles.renderActive(canvas);

  canvas.restore();
}

/**
 * @param {GameObject} object
 */
function renderObject(object: GameObject, world: GameWorld) {
  var canvas = getCanvas(LAYER_DEFAULT);

  canvas
    .save()
    .fillStyle('red')
    .translate(object.getX(), object.getY() - world.terrain.getHeightAt(object.vec));
  if (object.getClass() !== 'Soldier') {
    canvas.rotate(object.getDirection());
  }
  object.render(canvas);
  canvas.restore();
  // if (object instanceof SoldierObject && object.targeting.enemy && object.state.life > 0) {
  //   canvas.strokeStyle(object.color);
  //   canvas.line(object.getX(), object.getY(), object.targeting.enemy.getX(), object.targeting.enemy.getY());
  // }
}

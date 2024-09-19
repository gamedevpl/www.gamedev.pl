import { ARROW_RANGE, BALL_RANGE, EDGE_RADIUS, MIN_TICK, UPDATE_TICK } from '../consts.js';
import { VMath } from '../vmath.js';
import { ArrowObject, ExplosionObject } from './objects/object-arrow.js';
import { SoldierObject } from './objects/object-soldier.js';

export class GameWorld {
  constructor() {
    this.objects = [];
    this.objectsByType = {
      Soldier: [],
      Arrow: [],
      Explosion: [],
    };
    this.collisionHandlers = [];
    this.edgeRadius = EDGE_RADIUS * 1.5;

    this.worldTime = 0;

    this.onCollision(SoldierObject, SoldierObject, this.onSoldierCollision.bind(this));
    this.onCollision(SoldierObject, ArrowObject, this.onArrowCollision.bind(this));
  }

  destroy() {}

  getTime() {
    return this.worldTime;
  }

  getEdgeRadius() {
    return this.edgeRadius;
  }

  addObject(...args) {
    for (var object of args) {
      this.objects.push(object);
      this.objectsByType[object.getClass()].push(object);
    }
  }

  /**
   * @param {GameObject} object
   */
  removeObject(object) {
    this.objects.splice(this.objects.indexOf(object), 1);
  }

  queryObjects(type, fn) {
    return this.objectsByType[type].filter(function (object) {
      return !fn || fn(object);
    });
  }

  /**
   * Update game state
   * @param elapsedTime how much time elapsed since last update
   * @return {Number} elapsedTime not consumed
   */
  update(elapsedTime) {
    var deltaTime = Math.min(elapsedTime, MIN_TICK);
    this.objects.forEach(function (object) {
      this.updateObject(object, deltaTime / UPDATE_TICK);
    }, this);
    elapsedTime -= deltaTime;
    this.worldTime += deltaTime;

    this.collisions();

    this.edgeRadius = Math.max(EDGE_RADIUS * 1.5 * (1 - this.getTime() / 60000), 400);

    return elapsedTime;
  }

  /**
   * Collision check
   */
  collisions() {
    var hitArrows = this.queryObjects('Arrow', (arrow) => arrow.isHit());
    this.queryObjects('Soldier').forEach(function (soldier) {
      if (soldier.life <= 0) {
        return;
      }

      // soldier -> soldier
      this.queryObjects('Soldier').forEach((soldierLeft, idxLeft) => {
        if (idxLeft <= this.objectsByType['Soldier'].indexOf(soldier) || soldierLeft.life <= 0 || soldier === soldierLeft) {
          return;
        }

        if (VMath.withinDistance(soldier.vec, soldierLeft.vec, soldier.getWidth())) {
          this.triggerCollisions(soldier, soldierLeft);
        }
      });

      // soldier -> arrow
      hitArrows.forEach((arrow) => {
        if (arrow && VMath.withinDistance(soldier.vec, arrow.vec, arrow.type === 'arrow' ? ARROW_RANGE : BALL_RANGE)) {
          this.triggerCollisions(soldier, arrow);
        }
      });

      // outside of battleground?
      if (!VMath.withinDistance(soldier.vec, [0, 0], this.getEdgeRadius())) {
        soldier.addForce(VMath.scale(VMath.normalize(soldier.vec), -1));
      }
    }, this);

    hitArrows.forEach((arrow) => {
      this.objects.splice(this.objects.indexOf(arrow), 1);
      this.objectsByType['Arrow'].splice(this.objectsByType['Arrow'].indexOf(arrow), 1);
      if (arrow.type === 'ball') {
        this.addObject(new ExplosionObject(arrow.vec, this.getTime(), this));
      }
    });
  }

  triggerCollisions(leftObject, rightObject) {
    this.collisionHandlers.forEach(function (collisionHandler) {
      if (leftObject instanceof collisionHandler.left && rightObject instanceof collisionHandler.right) {
        collisionHandler.handler(leftObject, rightObject);
      }
      if (rightObject instanceof collisionHandler.left && leftObject instanceof collisionHandler.right) {
        collisionHandler.handler(rightObject, leftObject);
      }
    });
  }

  onCollision(leftObjectType, rightObjectType, handler) {
    this.collisionHandlers.push({
      left: leftObjectType,
      right: rightObjectType,
      handler: handler,
    });
  }

  onSoldierCollision(leftSoldier, rightSoldier) {
    // soldiers should bounce off each other
    var distance = VMath.distance(leftSoldier.vec, rightSoldier.vec);
    if (distance === 0) {
      var subVector = VMath.scale(
        [Math.random() - Math.random(), Math.random() - Math.random()],
        1 / Number.MAX_SAFE_INTEGER,
      );
      leftSoldier.addForce(subVector);
      rightSoldier.addForce(VMath.scale(subVector, -1));
    } else {
      var subVector2 = VMath.scale(
        VMath.normalize(VMath.sub(leftSoldier.vec, rightSoldier.vec)),
        leftSoldier.getWidth() - distance,
      );
      leftSoldier.addForce(VMath.scale(subVector2, (1 / leftSoldier.weight) * rightSoldier.weight));
      rightSoldier.addForce(VMath.scale(subVector2, (-1 * leftSoldier.weight) / rightSoldier.weight));
    }
  }

  onArrowCollision(soldier, arrow) {
    var distance = VMath.distance(arrow.vec, soldier.vec);
    if (arrow.type === 'arrow') {
      arrow.hit(soldier, distance);
    } else if (arrow.type === 'ball' && soldier.cooldown('ballhit', 150)) {
      arrow.hit(soldier, distance);
      var sub = VMath.scale(VMath.normalize(VMath.sub(soldier.vec, arrow.vec)), soldier.getWidth() - distance);
      soldier.addForce(VMath.scale(sub, (-0.5 / soldier.weight) * (1 - distance / BALL_RANGE)));
    }
  }

  /**
   * Updates object
   * @param object
   * @param deltaTime
   */
  updateObject(object, deltaTime) {
    object.update(deltaTime);
  }

  getAlive() {
    return this.queryObjects('Soldier', (soldier) => soldier.life > 0).reduce(
      (r, soldier) => ((r[soldier.color] = (r[soldier.color] || 0) + 1), r),
      {
        '#ff0000': 0,
        '#00ff00': 0,
      },
    );
  }
}
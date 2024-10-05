import { ARROW_RANGE, BALL_RANGE, EDGE_RADIUS, MIN_TICK, UPDATE_TICK } from '../consts';
import { VMath } from '../util/vmath';
import { GameObject } from './objects/game-object';
import { ArrowObject, ExplosionObject } from './objects/object-arrow';
import { SoldierObject } from './objects/object-soldier';
import { ParticleSystem } from './particles/particle-system';

export class GameWorld {
  objects: GameObject[];
  objectsByType: { [key: string]: GameObject[] };
  collisionHandlers: any[];
  edgeRadius: number;
  worldTime: number;
  particles: ParticleSystem;

  constructor() {
    this.objects = [];
    this.objectsByType = {
      Soldier: [],
      Arrow: [],
      Explosion: [],
    };
    this.collisionHandlers = [];
    this.edgeRadius = EDGE_RADIUS * 1.5;
    this.particles = new ParticleSystem(EDGE_RADIUS * 3, EDGE_RADIUS * 2); // Initialize with canvas size

    this.worldTime = 0;

    this.onCollision(SoldierObject, SoldierObject, this.onSoldierCollision.bind(this));
    this.onCollision(SoldierObject, ArrowObject, this.onArrowCollision.bind(this));
  }

  destroy() {
    // Clean up resources if needed
  }

  getTime() {
    return this.worldTime;
  }

  getEdgeRadius() {
    return this.edgeRadius;
  }

  addObject(...args: GameObject[]) {
    for (var object of args) {
      this.objects.push(object);
      this.objectsByType[object.getClass()].push(object);
    }
  }

  removeObject(object: GameObject) {
    this.objects.splice(this.objects.indexOf(object), 1);
  }

  queryObjects<T extends GameObject>(type: string, fn?: (object: T) => boolean): T[] {
    return this.objectsByType[type].filter((object) => {
      return !fn || fn(object as T);
    }) as T[];
  }

  update(elapsedTime: number) {
    var deltaTime = Math.min(elapsedTime, MIN_TICK);
    this.objects.forEach((object) => {
      this.updateObject(object, deltaTime / UPDATE_TICK);
    });
    elapsedTime -= deltaTime;
    this.worldTime += deltaTime;

    this.collisions();

    this.edgeRadius = Math.max(EDGE_RADIUS * 1.5 * (1 - this.getTime() / 60000), 400);

    this.particles.update(deltaTime / UPDATE_TICK);

    return elapsedTime;
  }

  collisions() {
    var hitArrows = this.queryObjects('Arrow', (arrow: ArrowObject) => arrow.isHit());
    this.queryObjects<SoldierObject>('Soldier').forEach((soldier) => {
      if (soldier.life <= 0) {
        return;
      }

      // soldier -> soldier
      this.queryObjects<SoldierObject>('Soldier').forEach((soldierLeft, idxLeft) => {
        if (
          idxLeft <= this.objectsByType['Soldier'].indexOf(soldier) ||
          soldierLeft.life <= 0 ||
          soldier === soldierLeft
        ) {
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

  triggerCollisions(leftObject: GameObject, rightObject: GameObject) {
    this.collisionHandlers.forEach(function (collisionHandler) {
      if (leftObject instanceof collisionHandler.left && rightObject instanceof collisionHandler.right) {
        collisionHandler.handler(leftObject, rightObject);
      }
      if (rightObject instanceof collisionHandler.left && leftObject instanceof collisionHandler.right) {
        collisionHandler.handler(rightObject, leftObject);
      }
    });
  }

  onCollision<L extends GameObject, R extends GameObject>(
    leftObjectType: new (...args: any[]) => L,
    rightObjectType: new (...args: any[]) => R,
    handler: (left: L, right: R) => void,
  ) {
    this.collisionHandlers.push({
      left: leftObjectType,
      right: rightObjectType,
      handler: handler,
    });
  }

  onSoldierCollision(leftSoldier: SoldierObject, rightSoldier: SoldierObject) {
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

  onArrowCollision(soldier: SoldierObject, arrow: ArrowObject) {
    var distance = VMath.distance(arrow.vec, soldier.vec);
    if (arrow.type === 'arrow') {
      arrow.hit(soldier, distance);
    } else if (arrow.type === 'ball' && soldier.cooldown('ballhit', 150)) {
      arrow.hit(soldier, distance);
      var sub = VMath.scale(VMath.normalize(VMath.sub(soldier.vec, arrow.vec)), soldier.getWidth() - distance);
      soldier.addForce(VMath.scale(sub, (-0.5 / soldier.weight) * (1 - distance / BALL_RANGE)));
    }
  }

  updateObject(object: GameObject, deltaTime: number) {
    object.update(deltaTime);
  }

  getAlive() {
    return this.queryObjects<SoldierObject>('Soldier', (soldier) => soldier.life > 0).reduce(
      (r, soldier) => ((r[soldier.color] = (r[soldier.color] || 0) + 1), r),
      {
        '#ff0000': 0,
        '#00ff00': 0,
      } as Record<string, number>,
    );
  }
}
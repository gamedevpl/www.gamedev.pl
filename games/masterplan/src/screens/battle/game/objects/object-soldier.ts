import { GameObject } from './game-object';
import { VMath } from '../../util/vmath';
import { EVENT_DAMAGE, EVENT_DAMAGE_ARROW } from '../../events';
import { aa } from '../../util/arcade-audio';
import {
  MAX_LIFE,
  SOLDIER_WIDTH,
  SOLDIER_HEIGHT,
  MELEE_SEEK_RANGE,
  MELEE_ATTACK_RANGE,
  MELEE_ATTACK_COOLDOWN,
  RANGED_SEEK_RANGE,
  RANGED_ATTACK_RANGE,
  MIN_RANGE_ATTACK,
  RANGED_ATTACK_COOLDOWN,
  DEFENCE_COOLDOWN,
  SEEK_COOLDOWN,
} from '../../consts';
import { updateState } from '../../states';
import { ArrowObject } from './object-arrow';
import { $ } from '../../util/dom';
import { GameWorld } from '../game-world';
import { SoldierPlan } from '../masterplan/soldierplan';
import { Canvas } from '../../util/canvas';
import { spillBlood } from '../particles/effects/blood-effect';
import { createSmokeEffect } from '../particles/effects/smoke-effect';

let soldierID = 0;

export class SoldierObject extends GameObject {
  soldierId: number;
  plan: SoldierPlan;
  world: GameWorld;
  type: string;
  velocity: number;
  targetVelocity: number;
  force: [number, number];
  targetDirection: number;
  image: any;
  imageDead: any;
  color: string;
  life: number;
  newLife: number;
  defenceCooldown: number;
  weight: number;
  baseSpeed: number;
  seekRange: number = 0;
  attackRange: number = 0;
  rangeDefence: number = 0;
  meleeDefence: number = 0;
  meleeAttack: number = 0;
  canCharge: boolean = false;
  isMelee: boolean = false;
  rangeAttack: number | undefined;
  rangedCooldown: number | undefined;
  rangeType: 'arrow' | 'ball' | undefined;
  cooldowns: Record<string, number> = {};
  enemy: any;

  constructor(
    x: number,
    y: number,
    direction: number,
    plan: SoldierPlan,
    world: GameWorld,
    color: string,
    type: 'tank' | 'warrior' | 'archer' | 'artillery',
  ) {
    direction += (Math.random() - Math.random()) / 1000;
    super(x, y, SOLDIER_WIDTH, SOLDIER_HEIGHT, direction);
    this.soldierId = soldierID++;
    this.plan = plan;
    this.world = world;
    this.type = type;

    this.velocity = 0;
    this.targetVelocity = 1;

    this.force = [0, 0];

    this.targetDirection = direction;

    this.image = $('#asset-soldier-' + this.type);
    this.imageDead = $('#asset-soldier-' + this.type + '-dead');
    this.color = color;

    this.life = MAX_LIFE;
    this.newLife = MAX_LIFE;

    this.defenceCooldown = DEFENCE_COOLDOWN;
    this.weight = 1;
    this.baseSpeed = 1;

    if (this.type === 'warrior') {
      this.seekRange = MELEE_SEEK_RANGE;
      this.attackRange = MELEE_ATTACK_RANGE;

      this.rangeDefence = 30;

      this.meleeDefence = 50;
      this.meleeAttack = 25;
      this.baseSpeed = 3;

      this.canCharge = true;
      this.isMelee = true;
    } else if (this.type === 'tank') {
      this.seekRange = MELEE_SEEK_RANGE;
      this.attackRange = MELEE_ATTACK_RANGE * 1.1;

      this.rangeDefence = 100;

      this.meleeDefence = 100;
      this.meleeAttack = 15;
      this.life = this.newLife = MAX_LIFE * 2;

      this.defenceCooldown = DEFENCE_COOLDOWN / 5;
      this.weight = 3;

      this.canCharge = false;
      this.isMelee = true;
    } else if (this.type === 'archer') {
      this.seekRange = RANGED_SEEK_RANGE;
      this.attackRange = RANGED_ATTACK_RANGE;

      this.rangeAttack = 45;
      this.rangeDefence = 25;
      this.rangedCooldown = RANGED_ATTACK_COOLDOWN;

      this.meleeDefence = 10;
      this.meleeAttack = 10;
      this.rangeType = 'arrow';
    } else if (this.type === 'artillery') {
      this.seekRange = RANGED_SEEK_RANGE;
      this.attackRange = RANGED_ATTACK_RANGE * 5;
      this.weight = 10;
      this.baseSpeed = 0.1;

      this.rangeAttack = 100;
      this.rangeDefence = 1;
      this.rangedCooldown = RANGED_ATTACK_COOLDOWN * 10;

      this.meleeDefence = 1;
      this.meleeAttack = 1;
      this.rangeType = 'ball';
    }

    this.cooldowns = {};
  }

  render(canvas: Canvas) {
    canvas
      .save()
      .translate(-this.getWidth() / 2, -this.getHeight() / 2)
      .drawImage(this.life > 0 ? this.image : this.imageDead, 0, 0);

    if (this.life > 0) {
      if (this.life < MAX_LIFE) {
        canvas.drawText(10, 0, String(this.life << 0));
      }
      canvas.fillStyle(this.color).fillRect(0, 10, 10, (5 * this.life) / MAX_LIFE);
    }

    canvas.restore();
  }

  cooldown(name: string, maxValue: number) {
    if (!this.cooldowns[name] || this.world.getTime() > this.cooldowns[name]) {
      this.cooldowns[name] = this.world.getTime() + maxValue;
      return true;
    }
  }

  setTargetDirection(targetDirection: number) {
    this.targetDirection = targetDirection;
  }

  setTargetVelocity(targetVelocity: number) {
    this.targetVelocity = targetVelocity * this.baseSpeed;
  }

  updateVelocity(deltaTime: number) {
    this.velocity = this.getTargetVelocity() * deltaTime + this.velocity * (1 - deltaTime);
  }

  getTargetVelocity() {
    return this.targetVelocity;
  }

  getVelocity() {
    return this.velocity;
  }

  update(deltaTime: number) {
    if (this.life > 0) {
      this.updatePlan();
    } else if (this.enemy) {
      this.setEnemy(null);
    }

    this.updateVelocity(deltaTime);

    this.setX(this.vec[0] + this.force[0] * deltaTime);
    this.setY(this.vec[1] + this.force[1] * deltaTime);

    var cx = Math.cos(this.getDirection()) * (1 - deltaTime),
      cy = Math.sin(this.getDirection()) * (1 - deltaTime);
    var dx = Math.cos(this.targetDirection) * deltaTime,
      dy = Math.sin(this.targetDirection) * deltaTime;
    this.setDirection(Math.atan2(cy + dy, cx + dx));

    if (this.life > 0) {
      this.addForce(
        VMath.scale(
          [Math.cos(this.direction), Math.sin(this.direction)],
          (this.velocity * (1 - Math.random()) * deltaTime) / 2,
        ),
      );
    }

    this.force = VMath.sub(this.force, VMath.scale(this.force, deltaTime * 0.1));
    if (VMath.length(this.force) < VMath.EPSILON) {
      this.force = [0, 0];
    }

    this.life = this.newLife;
  }

  distance(soldier: SoldierObject) {
    return VMath.distance(this.vec, soldier.vec);
  }

  queryEnemy(distance: number) {
    var enemies = this.world.queryObjects<SoldierObject>(
      'Soldier',
      (soldier) =>
        soldier.isEnemy(this) &&
        soldier.life > 0 &&
        VMath.withinDistance(soldier.vec, this.vec, distance) &&
        this.plan.canClaim(soldier, this),
    );
    if (enemies.length > 0) {
      var fn;
      if (this.type === 'artillery') {
        fn = (r: SoldierObject, soldier: SoldierObject) => (soldier.distance(this) > r.distance(this) ? soldier : r);
      } else {
        fn = (r: SoldierObject, soldier: SoldierObject) => (soldier.distance(this) < r.distance(this) ? soldier : r);
      }
      return enemies.reduce(fn, enemies[0]);
    }
    return null;
  }

  seekEnemy(distance: number) {
    if (this.enemy && (this.enemy.life <= 0 || this.enemy.distance(this) > distance)) {
      this.setEnemy(null);
    }

    if (!this.enemy && this.cooldown('seek-' + distance, SEEK_COOLDOWN)) {
      this.setEnemy(this.queryEnemy(distance));
    }

    if (this.enemy) {
      var target = this.enemy.vec;
      var dist = VMath.distance(this.vec, target);
      var direction = VMath.atan2(this.vec, target);
      this.setTargetDirection(direction);

      var velocityBonus = 0;
      if (this.canCharge && dist > 50 && dist < MELEE_SEEK_RANGE && !this.cooldown('charge', 10)) {
        velocityBonus += 1;
      }
      this.setTargetVelocity(this.isMelee || dist > this.attackRange ? 1 + velocityBonus : 0);

      if (
        this.rangeAttack &&
        dist < this.attackRange &&
        dist > MIN_RANGE_ATTACK &&
        this.cooldown('arrow', this.rangedCooldown!)
      ) {
        this.world.addObject(new ArrowObject(this.vec, this.enemy.vec, this.world, this.rangeAttack, this.rangeType!));
        aa.play('arrow');
        if (this.type === 'artillery') {
          this.hitBy(50);
          // Create smoke effect when artillery fires
          createSmokeEffect(this.vec, this.enemy.vec, this.world.particles);
        }
      }
      if (dist < MELEE_ATTACK_RANGE && this.cooldown('sword', MELEE_ATTACK_COOLDOWN)) {
        this.enemy.hit(this);
      }

      return true;
    }
  }

  updatePlan() {
    if (!this.seekEnemy(this.seekRange)) {
      this.plan.getCommand(this.world.getTime()).execute(this);
    }
  }

  addForce(vec: [number, number]) {
    this.force = VMath.add(this.force, vec);
  }

  getDefence(soldier: SoldierObject | ArrowObject, factor: number) {
    var baseDefence =
      Math.abs(VMath.angle(VMath.sub(soldier.vec, this.vec), [Math.cos(this.direction), Math.sin(this.direction)])) /
      Math.PI;
    return Math.min(baseDefence / factor, 0.3);
  }

  getAttack(soldier: SoldierObject) {
    return (1 - this.getDefence(soldier, this.meleeDefence)) * this.meleeAttack;
  }

  hit(bySoldier: SoldierObject) {
    var damage =
      (this.cooldown('defence', this.defenceCooldown) ? this.getDefence(bySoldier, this.meleeDefence) : 1) *
      bySoldier.getAttack(this);
    this.hitBy(damage);
    updateState(EVENT_DAMAGE, { soldier: this, damage: damage });
    this.setEnemy(bySoldier);
    aa.play('damage');

    spillBlood(this.vec, bySoldier.vec, damage / 5, this.world.particles);
  }

  hitByArrow(arrow: ArrowObject, distance: number) {
    var damage;
    if (arrow.type === 'ball') {
      damage = arrow.getAttack() / Math.pow(distance, 1 / 4);
    } else {
      damage =
        arrow.getAttack() *
        (this.cooldown('defence', this.defenceCooldown) ? this.getDefence(arrow, this.rangeDefence) : 1);
    }
    this.hitBy(damage);
    updateState(EVENT_DAMAGE_ARROW, { soldier: this, damage: damage });
    aa.play('hitarrow');

    spillBlood(this.vec, arrow.vec, damage / 5, this.world.particles);
  }

  hitBy(value: number) {
    this.newLife = Math.max(this.newLife - value, 0);
  }

  isEnemy(ofSoldier: SoldierObject) {
    return this.plan.masterPlan !== ofSoldier.plan.masterPlan;
  }

  getClass() {
    return 'Soldier';
  }

  setEnemy(enemy: SoldierObject | null) {
    if (this.enemy) {
      this.plan.unclaim(this.enemy, this);
      this.enemy = null;
    }
    if (enemy && this.plan.claim(enemy, this)) {
      this.enemy = enemy;
    }
  }
}

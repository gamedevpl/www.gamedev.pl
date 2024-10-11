import { VMath } from '../../util/vmath';
import { SoldierObject } from './object-soldier';
import { ArrowObject } from './object-arrow';
import { SEEK_COOLDOWN, MIN_RANGE_ATTACK, MELEE_ATTACK_RANGE } from '../../consts';
import { aa } from '../../util/arcade-audio';
import { createSmokeEffect } from '../particles/effects/smoke-effect';

export class SoldierTargeting {
  private soldier: SoldierObject;
  private enemy: SoldierObject | null = null;

  constructor(soldier: SoldierObject) {
    this.soldier = soldier;
  }

  seekEnemy(seekRange = this.soldier.state.seekRange): boolean {
    if (this.enemy && (this.enemy.state.life <= 0 || this.enemy.distance(this.soldier) > seekRange)) {
      this.clearEnemy();
    }

    if (!this.enemy && this.soldier.state.cooldown('seek-' + seekRange, SEEK_COOLDOWN)) {
      this.setEnemy(this.queryEnemy(seekRange));
    }

    if (this.enemy) {
      const target = this.enemy.vec;
      const dist = VMath.distance(this.soldier.vec, target);
      const direction = VMath.atan2(this.soldier.vec, target);
      this.soldier.movement.setTargetDirection(direction);

      let velocityBonus = 0;
      if (this.soldier.state.canCharge && dist > 50 && dist < seekRange && !this.soldier.state.cooldown('charge', 10)) {
        velocityBonus += 1;
      }
      this.soldier.movement.setTargetVelocity(
        this.soldier.state.isMelee || dist > this.soldier.state.attackRange ? 1 + velocityBonus : 0,
      );

      if (
        this.soldier.state.rangeAttack &&
        dist < this.soldier.state.attackRange &&
        dist > MIN_RANGE_ATTACK &&
        this.soldier.state.cooldown('arrow', this.soldier.state.rangedCooldown!)
      ) {
        this.soldier.world.addObject(
          new ArrowObject(
            this.soldier.vec,
            this.enemy.vec,
            this.soldier.world,
            this.soldier.state.rangeAttack!,
            this.soldier.state.rangeType!,
          ),
        );
        aa.play('arrow');
        if (this.soldier.type === 'artillery') {
          this.soldier.state.hitBy(50);
          createSmokeEffect(this.soldier.vec, this.enemy.vec, this.soldier.world.particles);
        }
      }
      if (dist < MELEE_ATTACK_RANGE && this.soldier.state.cooldown('sword', this.soldier.state.meleeAttackCooldown)) {
        this.soldier.attack.hit(this.enemy);
      }

      return true;
    }

    return false;
  }

  private queryEnemy(distance: number): SoldierObject | null {
    const enemies = this.soldier.world.queryObjects<SoldierObject>(
      'Soldier',
      (soldier) =>
        soldier.isEnemy(this.soldier) &&
        soldier.state.life > 0 &&
        VMath.withinDistance(soldier.vec, this.soldier.vec, distance) &&
        this.soldier.plan.canClaim(soldier, this.soldier),
    );
    if (enemies.length > 0) {
      const fn =
        this.soldier.type === 'artillery'
          ? (r: SoldierObject, soldier: SoldierObject) =>
              soldier.distance(this.soldier) > r.distance(this.soldier) ? soldier : r
          : (r: SoldierObject, soldier: SoldierObject) =>
              soldier.distance(this.soldier) < r.distance(this.soldier) ? soldier : r;
      return enemies.reduce(fn, enemies[0]);
    }
    return null;
  }

  setEnemy(enemy: SoldierObject | null) {
    if (this.enemy) {
      this.soldier.plan.unclaim(this.enemy, this.soldier);
      this.enemy = null;
    }
    if (enemy && this.soldier.plan.claim(enemy, this.soldier)) {
      this.enemy = enemy;
    }
  }

  clearEnemy() {
    this.setEnemy(null);
  }

  hasEnemy(): boolean {
    return this.enemy !== null;
  }

  getEnemy(): SoldierObject | null {
    return this.enemy;
  }
}

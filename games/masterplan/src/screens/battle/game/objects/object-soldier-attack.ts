import { VMath } from '../../util/vmath';
import { SoldierObject } from './object-soldier';
import { ArrowObject } from './object-arrow';
import { EVENT_DAMAGE, EVENT_DAMAGE_ARROW } from '../../events';
import { updateState } from '../../states';
import { aa } from '../../util/arcade-audio';
import { spillBlood } from '../particles/effects/blood-effect';

export class SoldierAttack {
  private soldier: SoldierObject;

  constructor(soldier: SoldierObject) {
    this.soldier = soldier;
  }

  hit(targetSoldier: SoldierObject) {
    const damage =
      (this.soldier.state.cooldown('defence', this.soldier.state.defenceCooldown)
        ? this.getDefence(targetSoldier, this.soldier.state.meleeDefence)
        : 1) * this.getAttack(targetSoldier);
    targetSoldier.state.hitBy(damage);
    updateState(EVENT_DAMAGE, { soldier: targetSoldier, damage: damage });
    targetSoldier.targeting.setEnemy(this.soldier);
    aa.play('damage');

    spillBlood(targetSoldier.vec, this.soldier.vec, damage / 5, this.soldier.world.particles);
  }

  hitByArrow(arrow: ArrowObject, distance: number) {
    let damage: number;
    if (arrow.type === 'ball') {
      damage = arrow.getAttack() / Math.pow(distance, 1 / 4);
    } else {
      damage =
        arrow.getAttack() *
        (this.soldier.state.cooldown('defence', this.soldier.state.defenceCooldown)
          ? this.getDefence(arrow, this.soldier.state.rangeDefence)
          : 1);
    }
    this.soldier.state.hitBy(damage);
    updateState(EVENT_DAMAGE_ARROW, { soldier: this.soldier, damage: damage });
    aa.play('hitarrow');

    spillBlood(this.soldier.vec, arrow.vec, damage / 5, this.soldier.world.particles);
  }

  private getDefence(attacker: SoldierObject | ArrowObject, factor: number) {
    const baseDefence =
      Math.abs(
        VMath.angle(VMath.sub(attacker.vec, this.soldier.vec), [
          Math.cos(this.soldier.getDirection()),
          Math.sin(this.soldier.getDirection()),
        ]),
      ) / Math.PI;
    return Math.min(baseDefence / factor, 0.3);
  }

  private getAttack(targetSoldier: SoldierObject) {
    return (1 - this.getDefence(targetSoldier, this.soldier.state.meleeDefence)) * this.soldier.state.meleeAttack;
  }
}

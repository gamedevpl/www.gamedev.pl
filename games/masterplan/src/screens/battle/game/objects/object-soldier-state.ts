import { SoldierObject } from './object-soldier';
import { MAX_LIFE, DEFENCE_COOLDOWN, MELEE_ATTACK_COOLDOWN } from '../../consts';

interface SoldierProperties {
  seekRange?: number;
  attackRange?: number;
  rangeDefence?: number;
  meleeDefence?: number;
  meleeAttack?: number;
  rangeAttack?: number;
  rangedCooldown?: number;
  life?: number;
  newLife?: number;
  defenceCooldown?: number;
  weight?: number;
  baseSpeed?: number;
  canCharge?: boolean;
  isMelee?: boolean;
  rangeType?: 'arrow' | 'ball';
}

export class SoldierState {
  private soldier: SoldierObject;
  life: number = MAX_LIFE;
  newLife: number = MAX_LIFE;
  defenceCooldown: number = DEFENCE_COOLDOWN;
  weight: number = 1;
  baseSpeed: number = 1;
  seekRange: number = 0;
  attackRange: number = 0;
  rangeDefence: number = 0;
  meleeDefence: number = 0;
  meleeAttack: number = 0;
  meleeAttackCooldown: number = MELEE_ATTACK_COOLDOWN;
  rangeAttack: number | undefined;
  rangedCooldown: number | undefined;
  canCharge: boolean = false;
  isMelee: boolean = false;
  rangeType: 'arrow' | 'ball' | undefined;
  cooldowns: Record<string, number> = {};

  constructor(soldier: SoldierObject) {
    this.soldier = soldier;
  }

  setProperties(props: SoldierProperties) {
    Object.assign(this, props);
  }

  update(_deltaTime: number) {
    this.life = this.newLife;
  }

  cooldown(name: string, maxValue: number): boolean {
    if (!this.cooldowns[name] || this.soldier.world.getTime() > this.cooldowns[name]) {
      this.cooldowns[name] = this.soldier.world.getTime() + maxValue;
      return true;
    }
    return false;
  }

  hitBy(value: number) {
    this.newLife = Math.max(this.newLife - value, 0);
  }

  isAlive() {
    return this.life > 0;
  }
}

import { SoldierObject } from '../objects/object-soldier';
import { Command, WaitCommand } from './commands';
import { MasterPlan } from './masterplan';

export class SoldierPlan {
  masterPlan: MasterPlan;
  formation: [number, number];
  plan: Command[];
  currentCommand: Command | null;
  claims: Record<number, SoldierObject[]>;

  constructor(masterPlan: MasterPlan, formation: [number, number], plan: Command[]) {
    this.masterPlan = masterPlan;
    this.formation = formation;
    this.plan = plan;
    this.currentCommand = null;
    this.claims = masterPlan.claims;
  }

  getPosition() {
    return this.formation;
  }

  getCommand(worldTime: number) {
    if ((!this.currentCommand || this.currentCommand.isDone(worldTime)) && this.plan.length > 0) {
      this.currentCommand = this.plan.splice(0, 1)[0];
      this.currentCommand.start(worldTime);
    }

    if (!this.currentCommand) {
      this.currentCommand = new WaitCommand();
    }

    return this.currentCommand;
  }

  canClaim(enemy: SoldierObject, soldier: SoldierObject): boolean {
    if (!this.claims[enemy.soldierId]) {
      this.claims[enemy.soldierId] = [];
    }

    if (this.claims[enemy.soldierId].length < 5) {
      return true;
    }

    const dist = soldier.distance(enemy);
    const distant = this.claims[enemy.soldierId].filter((claimer) => claimer.distance(enemy) > dist);
    if (distant.length === this.claims[enemy.soldierId].length) {
      return true;
    }

    return false;
  }

  unclaim(enemy: SoldierObject, soldier: SoldierObject) {
    const idx = this.claims[enemy.soldierId].indexOf(soldier);
    if (idx >= 0) {
      this.claims[enemy.soldierId].splice(idx, 1);
    }
  }
  claim(enemy: SoldierObject, soldier: SoldierObject) {
    if (!this.canClaim(enemy, soldier)) {
      return false;
    }

    this.claims[enemy.soldierId].push(soldier);

    return true;
  }
}

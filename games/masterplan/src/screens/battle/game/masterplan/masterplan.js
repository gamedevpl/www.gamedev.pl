import { VMath } from '../../vmath.js';
import { AdvanceCommand, WaitCommand, AttackCommand, FlankLeftCommand, FlankRightCommand } from './commands.js';
import { SoldierPlan } from './soldierplan.js';
import { SOLDIER_WIDTH, SOLDIER_HEIGHT } from '../../consts.js';

export class MasterPlan {
  constructor(initialPosition, units) {
    var angle = VMath.atan2(initialPosition, [0, 0]);

    this.type = [];
    this.formation = [];
    this.plan = [];
    this.claims = {};

    units.forEach((unit) => {
      var soldierCount = unit['sizeCol'] * unit['sizeRow'];
      var offset = [unit['col'] * SOLDIER_WIDTH, unit['row'] * SOLDIER_HEIGHT];
      for (var i = 0; i < soldierCount; i++) {
        var pos = [(i % unit['sizeCol']) * SOLDIER_WIDTH, ((i / unit['sizeCol']) << 0) * SOLDIER_HEIGHT];
        this.formation.push(VMath.add(pos, offset));
        this.type.push(unit['type']);

        switch (unit['command']) {
          case 'advance-wait':
            this.plan.push([new AdvanceCommand(), new WaitCommand(10000), new AttackCommand()]);
            break;
          case 'advance':
            this.plan.push([new AdvanceCommand(), new AttackCommand()]);
            break;
          case 'wait-advance':
            this.plan.push([new WaitCommand(10000), new AttackCommand()]);
            break;
          case 'flank-left':
            this.plan.push([new FlankLeftCommand(angle), new AttackCommand()]);
            break;
          case 'flank-right':
            this.plan.push([new FlankRightCommand(angle), new AttackCommand()]);
            break;
          default:
            this.plan.push([new AdvanceCommand(), new AttackCommand()]);
            break;
        }
      }
    });
  }

  getSoldierCount() {
    return this.formation.length;
  }

  getType(soldierId) {
    return this.type[soldierId];
  }

  getSolderPlan(soldierId) {
    return new SoldierPlan(this, this.formation[soldierId], this.plan[soldierId]);
  }
}

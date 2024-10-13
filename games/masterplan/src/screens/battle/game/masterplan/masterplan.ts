import { VMath } from '../../util/vmath';
import { AdvanceCommand, WaitCommand, AttackCommand, FlankLeftCommand, FlankRightCommand, Command } from './commands';
import { SoldierPlan } from './soldierplan';
import { SOLDIER_WIDTH, SOLDIER_HEIGHT } from '../../consts';
import { Unit } from '../../../designer/designer-types';
import { SoldierObject } from '../objects/object-soldier';

export class MasterPlan {
  type: ('warrior' | 'archer' | 'tank' | 'artillery')[];
  formation: [number, number][];
  plan: Command[][];
  claims: Record<number, SoldierObject[]>;
  constructor(initialPosition: [number, number], units: Unit[]) {
    const angle = VMath.atan2(initialPosition, [0, 0]);

    this.type = [];
    this.formation = [];
    this.plan = [];
    this.claims = {};

    units.forEach((unit) => {
      const soldierCount = unit['sizeCol'] * unit['sizeRow'];
      const offset: [number, number] = [unit['col'] * SOLDIER_WIDTH, unit['row'] * SOLDIER_HEIGHT];
      for (let i = 0; i < soldierCount; i++) {
        const pos: [number, number] = [
          (i % unit['sizeCol']) * SOLDIER_WIDTH,
          ((i / unit['sizeCol']) << 0) * SOLDIER_HEIGHT,
        ];
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

  getType(soldierId: number) {
    return this.type[soldierId];
  }

  getSolderPlan(soldierId: number) {
    return new SoldierPlan(this, this.formation[soldierId], this.plan[soldierId]);
  }
}

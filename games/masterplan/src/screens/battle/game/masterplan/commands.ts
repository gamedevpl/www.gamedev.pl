import { VMath } from '../../util/vmath';
import { EDGE_RADIUS } from '../../consts';
import { SoldierObject } from '../objects/object-soldier';

export class Command {
  startTime: number = -1;
  done: boolean = false;
  start(worldTime: number) {
    this.startTime = worldTime;
  }

  execute(_soldier: SoldierObject) {}

  isDone(_worldTime: number) {
    return this.done;
  }
}

export class WaitCommand extends Command {
  duration: number | undefined = undefined;
  constructor(duration?: number) {
    super();
    this.duration = duration;
  }

  isDone(worldTime: number) {
    return !!this.duration && this.startTime >= 0 && worldTime - this.startTime > this.duration;
  }

  execute(soldier: SoldierObject) {
    soldier.movement.setTargetVelocity(0);
  }
}

export class AdvanceCommand extends Command {
  constructor() {
    super();
  }

  getTarget(soldier: SoldierObject) {
    return soldier.plan.formation;
  }

  execute(soldier: SoldierObject) {
    // [0, 0] + formation
    var target = this.getTarget(soldier);
    var dist = VMath.distance(soldier.vec, target);
    var dir = VMath.atan2(soldier.vec, target);

    if (dist > 50) {
      soldier.movement.setTargetVelocity(1);
      soldier.movement.setTargetDirection(dir);
    } else {
      soldier.movement.setTargetVelocity(0);
      this.done = true;
    }
  }
}

export class FlankLeftCommand extends AdvanceCommand {
  angle: number;
  constructor(angle: number) {
    super();
    this.angle = angle;
  }

  getTarget(soldier: SoldierObject) {
    return VMath.add(VMath.rotate([200, 100 * Math.sign(Math.cos(this.angle))], this.angle), soldier.plan.formation);
  }
}

export class FlankRightCommand extends FlankLeftCommand {
  getTarget(soldier: SoldierObject) {
    return VMath.add(VMath.rotate([200, -100 * Math.sign(Math.cos(this.angle))], this.angle), soldier.plan.formation);
  }
}

export class AttackCommand extends Command {
  constructor() {
    super();
  }

  execute(soldier: SoldierObject) {
    if (!soldier.targeting.seekEnemy(EDGE_RADIUS)) {
      this.done = true;
    }
  }
}

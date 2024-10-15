import { Vec, VMath } from '../../util/vmath';
import { EDGE_RADIUS } from '../../consts';
import { SoldierObject } from '../objects/object-soldier';

type GetProgressProps = { soldier: SoldierObject; worldTime: number };

export abstract class Command {
  startTime: number = -1;
  done: boolean = false;
  start(worldTime: number) {
    this.startTime = worldTime;
  }

  abstract execute(soldier: SoldierObject): void;

  abstract isDone(worldTime: number): boolean;

  abstract getProgress(props: GetProgressProps): number;
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

  getProgress({ worldTime }: GetProgressProps) {
    return this.duration ? (worldTime - this.startTime) / this.duration : 1;
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
    const target = this.getTarget(soldier);
    const dist = VMath.distance(soldier.vec, target);
    const dir = VMath.atan2(soldier.vec, target);

    if (dist > 50) {
      soldier.movement.setTargetVelocity(1);
      soldier.movement.setTargetDirection(dir);
    } else {
      soldier.movement.setTargetVelocity(0);
      this.done = true;
    }
  }

  isDone(): boolean {
    return this.done;
  }

  getProgress(props: GetProgressProps): number {
    return props.worldTime > 0 ? 1 : 0;
  }
}

export class FlankLeftCommand extends AdvanceCommand {
  angle: number;
  flankDistance: number;

  constructor(angle: number, flankDistance: number = 300) {
    super();
    this.angle = angle;
    this.flankDistance = flankDistance;
  }

  getProgress({ soldier }: GetProgressProps) {
    const target = this.getTarget(soldier);
    const dist = VMath.distance(soldier.vec, target);
    return dist > 0 ? 1 / dist : 1;
  }

  getTarget(soldier: SoldierObject) {
    // Calculate the forward vector based on the formation angle
    const forwardVector = VMath.rotate([1, 0], this.angle);

    // Calculate the left vector (perpendicular to the forward vector)
    const leftVector = [forwardVector[1], forwardVector[0]] as Vec;

    // Scale the left vector by the flank distance
    const flankVector = VMath.scale(leftVector, this.flankDistance);

    // Add a small forward component to ensure some forward movement
    const forwardComponent = VMath.scale(forwardVector, this.flankDistance * 0.5);

    // Combine the flank and forward components
    const combinedVector = VMath.add(flankVector, forwardComponent);

    // Add the result to the soldier's formation position
    return VMath.add(soldier.plan.formation, combinedVector);
  }
}

export class FlankRightCommand extends FlankLeftCommand {
  getTarget(soldier: SoldierObject) {
    // Calculate the forward vector based on the formation angle
    const forwardVector = VMath.rotate([1, 0], this.angle);

    // Calculate the right vector (perpendicular to the forward vector)
    const rightVector = [-forwardVector[1], -forwardVector[0]] as Vec;

    // Scale the right vector by the flank distance
    const flankVector = VMath.scale(rightVector, this.flankDistance);

    // Add a small forward component to ensure some forward movement
    const forwardComponent = VMath.scale(forwardVector, this.flankDistance * 0.5);

    // Combine the flank and forward components
    const combinedVector = VMath.add(flankVector, forwardComponent);

    // Add the result to the soldier's formation position
    return VMath.add(soldier.plan.formation, combinedVector);
  }
}

export class AttackCommand extends Command {
  constructor() {
    super();
  }

  execute(soldier: SoldierObject) {
    if (!soldier.targeting.seekEnemy(EDGE_RADIUS * 2)) {
      this.done = true;
    }
  }

  isDone(): boolean {
    return this.done;
  }

  getProgress() {
    return 1;
  }
}

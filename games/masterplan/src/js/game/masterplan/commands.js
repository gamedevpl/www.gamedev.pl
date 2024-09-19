class Command {
    start(worldTime) {
        this.startTime = worldTime;
    }

    execute(soldier) {

    }

    isDone() {
        return this.done;
    }
}

class WaitCommand extends Command {
    constructor(duration) {
        super();
        this.duration = duration;
    }

    isDone(worldTime) {
        return this.startTime >= 0 && (worldTime - this.startTime > this.duration);
    }

    execute(soldier) {
        soldier.setTargetVelocity(0);
    }
}

class AdvanceCommand extends Command {
    constructor() {
        super();
    }

    getTarget(soldier) {
        return soldier.plan.formation;
    }

    execute(soldier) {
        // [0, 0] + formation
        var target = this.getTarget(soldier);
        var dist = VMath.distance(soldier.vec, target);
        var dir = VMath.atan2(soldier.vec, target);

        if (dist > 50) {
            soldier.setTargetVelocity(1);
            soldier.setTargetDirection(dir);
        } else {
            soldier.setTargetVelocity(0);
            this.done = true;
        }
    }
}

class FlankLeftCommand extends AdvanceCommand {
    constructor(angle) {
        super();
        this.angle = angle;
    }

    getTarget(soldier) {
        return VMath.add(VMath.rotate([200, 100 * Math.sign(Math.cos(this.angle))], this.angle), soldier.plan.formation);
    }
}

class FlankRightCommand extends FlankLeftCommand {
    getTarget(soldier) {
        return VMath.add(VMath.rotate([200, -100 * Math.sign(Math.cos(this.angle))], this.angle), soldier.plan.formation);
    }
}

class AttackCommand extends Command {
    constructor() {
        super();
    }

    execute(soldier) {
        if (!soldier.seekEnemy(EDGE_RADIUS)) {
            this.done = true;
        }
    }
}
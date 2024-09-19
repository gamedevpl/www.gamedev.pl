const DIMS = {
    "arrow": [10, 1],
    "ball": [10, 10],
}

class ArrowObject extends GameObject {
    constructor(from, to, world, attackBase, type) {
        super(from[0], from[1], DIMS[type][0], DIMS[type][1], VMath.atan2(from, to));
        this.world = world;
        this.from = from;
        this.to = to;
        this.maxDist = VMath.distance(from, to);
        this.attackBase = attackBase;
        this.type = type;

        this.v = VMath.normalize(VMath.sub(to, from));
    }

    update(deltaTime) {
        var d = VMath.scale(this.v, deltaTime * 20);
        this.vec[0] += d[0];
        this.vec[1] += d[1];
        var progress = Math.sin(VMath.distance(this.from, this.vec) / this.maxDist * Math.PI);
        this.adir = this.direction - Math.PI / 3 * (1 - progress);
        this.ay = this.vec[1] - progress * this.maxDist / 10;

        if (VMath.distance(this.from, this.vec) > this.maxDist) {
            this.world.removeObject(this);
        }
    }

    getY() {
        return this.ay;
    }

    getDirection() {
        return this.adir;
    }

    isHit() {
        return this.maxDist - VMath.distance(this.from, this.vec) < 10;
    }

    hit(soldier, distance) {
        soldier.hitByArrow(this, distance);
    }

    getAttack(soldier) {
        return this.attackBase;
    }

    getClass() {
        return "Arrow";
    };
}

class ExplosionObject extends GameObject {
    constructor(vec, time, world) {
        super(vec[0], vec[1], BALL_RANGE, BALL_RANGE, 0);
        this.time = time;
        this.world = world;
    }

    render(canvas) {
        var dt = this.world.getTime() - this.time;

        if (dt < 100) {
            canvas.save()       
                .arc(0, 0, BALL_RANGE * Math.min(dt / 100, 1))
            .restore();
        }
    }

    getClass() {
        return "Explosion";
    };
}
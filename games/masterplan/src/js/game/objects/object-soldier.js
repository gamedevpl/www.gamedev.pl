const SWORD_RANGE = 10;
const MELEE_ATTACK_RANGE = SOLDIER_WIDTH + SWORD_RANGE;
const MELEE_SEEK_RANGE = 600;
const MELEE_ATTACK_COOLDOWN = 250;

const RANGED_ATTACK_RANGE = 300;
const RANGED_SEEK_RANGE = 500;

const MIN_RANGE_ATTACK = SOLDIER_WIDTH * 5;
const RANGED_ATTACK_COOLDOWN = 1000;
const ARROW_RANGE = SOLDIER_WIDTH / 3;
const BALL_RANGE = SOLDIER_WIDTH * 4;

const DEFENCE_COOLDOWN = 1500;

const SEEK_COOLDOWN = 1000;

var soldierID = 0;
/**
 * @constructor
 */
function SoldierObject(x, y, direction, plan, world, color, type) {
    direction += (Math.random() - Math.random()) / 1000;
    GameObject.call(this, x, y, SOLDIER_WIDTH, SOLDIER_HEIGHT, direction);
    this.soldierId = soldierID++;
    this.plan = plan;
    this.world = world;
    this.type = type;
    
    this.velocity = 0;
    this.targetVelocity = 1;
    
    this.force = [0, 0];
    
    this.targetDirection = direction;
    
    this.image = $("#asset-soldier-" + this.type);
    this.imageDead = $("#asset-soldier-" + this.type + "-dead");
    this.color = color;

    this.life = MAX_LIFE;
    this.newLife = MAX_LIFE;

    this.defenceCooldown = DEFENCE_COOLDOWN;
    this.weight = 1;
    this.baseSpeed = 1;
    
    if (this.type === "warrior") {
        this.seekRange = MELEE_SEEK_RANGE;
        this.attackRange = MELEE_ATTACK_RANGE;

        this.rangeDefence = 30;

        this.meleeDefence = 50;
        this.meleeAttack = 45;
        this.baseSpeed = 3;

        this.canCharge = true;
        this.isMelee = true;
    } else if (this.type === "tank") {
        this.seekRange = MELEE_SEEK_RANGE;
        this.attackRange = MELEE_ATTACK_RANGE * 1.1;

        this.rangeDefence = 90;

        this.meleeDefence = 90;
        this.meleeAttack = 20;
	    this.life = this.newLife = MAX_LIFE * 2;

        this.defenceCooldown = DEFENCE_COOLDOWN / 5;
        this.weight = 3;
        
        this.canCharge = false;
        this.isMelee = true;        
    } else if (this.type === "archer") {
        this.seekRange = RANGED_SEEK_RANGE;
        this.attackRange = RANGED_ATTACK_RANGE;

        this.rangeAttack = 45;
        this.rangeDefence = 25;
        this.rangedCooldown = RANGED_ATTACK_COOLDOWN;

        this.meleeDefence = 10;
        this.meleeAttack = 10;
        this.rangeType = "arrow";
    } else if (this.type === "artillery") {
        this.seekRange = RANGED_SEEK_RANGE;
        this.attackRange = RANGED_ATTACK_RANGE * 5;
        this.weight = 10;
        this.baseSpeed = 0.1;

        this.rangeAttack = 100;
        this.rangeDefence = 1;
        this.rangedCooldown = RANGED_ATTACK_COOLDOWN * 10;

        this.meleeDefence = 1;
        this.meleeAttack = 1;
        this.rangeType = "ball";
    }

    this.cooldowns = {};
}

SoldierObject.prototype = Object.create(GameObject.prototype);

/**
 * @param {Canvas} canvas
 */
SoldierObject.prototype.render = function(canvas) {
    canvas.save()       
        .translate(-this.getWidth()/2, -this.getHeight()/2)
        .drawImage(this.life > 0 ? this.image : this.imageDead, 0, 0);

    if (this.life > 0) {
        if (this.life < MAX_LIFE) {
            canvas.drawText(10, 0, this.life << 0)
        }
        canvas.fillStyle(this.color)
            .fillRect(0, 10, 10, 5 * this.life / MAX_LIFE)
    }

    canvas.restore();
};

SoldierObject.prototype.cooldown = function(name, maxValue) {
    if (!this.cooldowns[name] || this.world.getTime() > this.cooldowns[name]) {
        this.cooldowns[name] = this.world.getTime() + maxValue;
        return true;
    }
};

// controls
SoldierObject.prototype.setTargetDirection = function(targetDirection) {
    this.targetDirection = targetDirection;
};

SoldierObject.prototype.setTargetVelocity = function(targetVelocity) {
    this.targetVelocity = targetVelocity * this.baseSpeed;
};

// update
SoldierObject.prototype.updateVelocity = function(deltaTime) {
    this.velocity = this.getTargetVelocity() * deltaTime + this.velocity * (1 - deltaTime);
};

SoldierObject.prototype.getTargetVelocity = function() {
    return this.targetVelocity;
};

SoldierObject.prototype.getVelocity = function() {
    return this.velocity;
};

SoldierObject.prototype.update = function(deltaTime) {
    if (this.life > 0) {
        this.updatePlan(deltaTime);
    } else if (this.enemy) {
        this.setEnemy(null);
    }

    this.updateVelocity(deltaTime);
    
    this.setX(this.vec[0] + this.force[0] * deltaTime);
    this.setY(this.vec[1] + this.force[1] * deltaTime);
    
    // rotate object
    var cx = Math.cos(this.getDirection()) * (1 - deltaTime),
        cy = Math.sin(this.getDirection()) * (1 - deltaTime);
    var dx = Math.cos(this.targetDirection) * deltaTime,
        dy = Math.sin(this.targetDirection) * deltaTime;
    this.setDirection(Math.atan2(cy + dy, cx + dx));

    // move force
    if (this.life > 0) {
        this.addForce(VMath.scale([Math.cos(this.direction), Math.sin(this.direction)], this.velocity * (1 - Math.random()) * deltaTime/2));
    }
    
    // degrade force
    this.force = VMath.sub(this.force, VMath.scale(this.force, deltaTime*0.1));
    if (VMath.length(this.force) < VMath.EPSILON) {
        this.force = [0, 0];
    }

    this.life = this.newLife;
};

SoldierObject.prototype.distance = function(soldier) {
    return VMath.distance(this.vec, soldier.vec);
};

SoldierObject.prototype.queryEnemy = function(distance) {
    var enemies = this.world.queryObjects("Soldier", 
        soldier => soldier.isEnemy(this) 
            && soldier.life > 0 
            && VMath.withinDistance(soldier.vec, this.vec, distance)
            && this.plan.canClaim(soldier, this));
    if (enemies.length > 0) {
        var fn;
        if (this.type === "artillery") {
            fn = (r, soldier) => soldier.distance(this) > r.distance(this) ? soldier : r;
        } else {
            fn = (r, soldier) => soldier.distance(this) < r.distance(this) ? soldier : r
        }
        return enemies.reduce(fn, enemies[0]);
    }
}

SoldierObject.prototype.seekEnemy = function(distance) {
    // are there any enemies?
    if (this.enemy && (this.enemy.life <= 0 || this.enemy.distance(this) > distance)) {
        this.setEnemy(null);
    }

    if (!this.enemy && this.cooldown("seek-" + distance, SEEK_COOLDOWN)) {
        this.setEnemy(this.queryEnemy(distance));
    }

    if (this.enemy) {
        var target = this.enemy.vec;
        var dist = VMath.distance(this.vec, target);
        var direction = VMath.atan2(this.vec, target);
        this.setTargetDirection(direction);

        var velocityBonus = 0;
        if (this.canCharge && dist > 50 && dist < MELEE_SEEK_RANGE && !this.cooldown("charge", 10)) {
            velocityBonus += 1;
        }
        this.setTargetVelocity(this.isMelee || dist > this.attackRange ? 1 + velocityBonus : 0);    
        
        if (this.rangeAttack && dist < this.attackRange && dist > MIN_RANGE_ATTACK && this.cooldown("arrow", this.rangedCooldown)) {
            this.world.addObject(new ArrowObject(this.vec, this.enemy.vec, this.world, this.rangeAttack, this.rangeType));
            aa.play("arrow");
            if (this.type === "artillery") {
                this.hitBy(50);
            }
        }
        if (dist < MELEE_ATTACK_RANGE && this.cooldown("sword", MELEE_ATTACK_COOLDOWN)) {
            this.enemy.hit(this);
        }

        return true;
    }
}

SoldierObject.prototype.updatePlan = function(deltaTime) {
    if (!this.seekEnemy(this.seekRange)) {
        // stick to the plan
        this.plan.getCommand(this.world.getTime()).execute(this);
    }    
};

SoldierObject.prototype.addForce = function(vec) {
    this.force = VMath.add(this.force, vec);
};

SoldierObject.prototype.getDefence = function(soldier, factor) {
    var baseDefence = Math.abs(VMath.angle(VMath.sub(soldier.vec, this.vec), [Math.cos(this.direction), Math.sin(this.direction)])) / Math.PI;
    return Math.min(baseDefence / factor, 0.3);
};

SoldierObject.prototype.getAttack = function(soldier) {
    return (1 - this.getDefence(soldier, this.meleeDefence)) * this.meleeAttack;
};

SoldierObject.prototype.hit = function(bySoldier) {
    var damage = (this.cooldown("defence", this.defenceCooldown) ? this.getDefence(bySoldier, this.meleeDefence) : 1) * bySoldier.getAttack(this);
    this.hitBy(damage);
    updateState(EVENT_DAMAGE, { soldier: this, damage: damage })
    this.setEnemy(bySoldier);
    aa.play("damage");
};

SoldierObject.prototype.hitByArrow = function(arrow, distance) {
    var damage;
    if (arrow.type === "ball") {
        damage = arrow.getAttack(arrow) / Math.pow(distance, 1/4);
    } else {
        damage = arrow.getAttack(arrow) * (this.cooldown("defence", this.defenceCooldown) ? this.getDefence(arrow, this.rangeDefence) : 1);
    }
    this.hitBy(damage);
    updateState(EVENT_DAMAGE_ARROW, { soldier: this, damage: damage });
    aa.play("hitarrow");
};

SoldierObject.prototype.hitBy = function(value) {    
    this.newLife = Math.max(this.newLife - value, 0);
};

SoldierObject.prototype.isEnemy = function(ofSoldier) {
    return this.plan.masterPlan !== ofSoldier.plan.masterPlan;
};

SoldierObject.prototype.getClass = function() {
    return "Soldier";
};

SoldierObject.prototype.setEnemy = function(enemy) {
    if (this.enemy) {
        this.plan.unclaim(this.enemy, this);
        this.enemy = null;
    }    
    if (enemy && this.plan.claim(enemy, this)) {
        this.enemy = enemy;
    }
}

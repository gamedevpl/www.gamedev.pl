/**
 * @constructor
 */
function GameWorld() {
    this.objects = [];
    this.objectsByType = {
        "Soldier": [],
        "Arrow": [],
        "Explosion": []
    };
    this.collisionHandlers = [];
    this.edgeRadius = EDGE_RADIUS * 1.5;
    
    this.worldTime = 0;
    
    this.onCollision(SoldierObject, SoldierObject, this.onSoldierCollision.bind(this));
    this.onCollision(SoldierObject, ArrowObject, this.onArrowCollision.bind(this));
};

GameWorld.prototype.destroy = function() {
};

GameWorld.prototype.getTime = function() {
    return this.worldTime;
};

GameWorld.prototype.getEdgeRadius = function() {
    return this.edgeRadius;
};

GameWorld.prototype.addObject = function() {
    for (var i = 0; i < arguments.length; i++) {
        var object = arguments[i];
        this.objects.push(object);
        this.objectsByType[object.getClass()].push(object);
    }
};

/**
 * @param {GameObject} object
 */
GameWorld.prototype.removeObject = function(object) {
    this.objects.splice(this.objects.indexOf(object), 1);
};

GameWorld.prototype.queryObjects = function(type, fn) {
    return this.objectsByType[type].filter(function(object) {
        return (!fn || fn(object));
    });
};

/**
 * Update game state
 * @param elapsedTime how much time elapsed since last update
 * @return {Number} elapsedTime not consumed
 */
GameWorld.prototype.update = function(elapsedTime) {
    var deltaTime = Math.min(elapsedTime, MIN_TICK);
    this.objects.forEach(function(object) {
        this.updateObject(object, deltaTime / UPDATE_TICK);
    }, this);
    elapsedTime -= deltaTime;
    this.worldTime += deltaTime;
    
    this.collisions();

    this.edgeRadius = Math.max(EDGE_RADIUS * 1.5 * (1 - this.getTime() / 60000), 400);
    
    return elapsedTime;
};

/**
 * Collision check
 */
GameWorld.prototype.collisions = function() {
    var hitArrows = this.queryObjects("Arrow", arrow => arrow.isHit());
    this.queryObjects("Soldier").forEach(function(soldier, idx) {
        if (soldier.life <= 0) {
            return;
        }

        // soldier -> soldier
        this.queryObjects("Soldier").forEach((soldierLeft, idxLeft) => {
            if (idx <= idxLeft || soldierLeft.life <= 0 || soldier === soldierLeft) {
                return;
            }
            
            if (VMath.withinDistance(soldier.vec, soldierLeft.vec, soldier.getWidth())) {
                this.triggerCollisions(soldier, soldierLeft);
            }
        });

        // soldier -> arrow
        hitArrows.forEach((arrow, idx) => {
            if (arrow && VMath.withinDistance(soldier.vec, arrow.vec, arrow.type === "arrow" ? ARROW_RANGE : BALL_RANGE)) {
                this.triggerCollisions(soldier, arrow);
            }
        });

        // outside of battleground?
        if (!VMath.withinDistance(soldier.vec, [0, 0], this.getEdgeRadius())) {
            soldier.addForce(VMath.scale(VMath.normalize(soldier.vec), -1));
        }
    }, this);

    hitArrows.forEach(arrow => {
        this.objects.splice(this.objects.indexOf(arrow), 1);
        this.objectsByType["Arrow"].splice(this.objectsByType["Arrow"].indexOf(arrow), 1);
        if (arrow.type === "ball") {
            this.addObject(new ExplosionObject(arrow.vec, this.getTime(), this));
        }
    });        
};

GameWorld.prototype.triggerCollisions = function(leftObject, rightObject) {
    this.collisionHandlers.forEach(function(collisionHandler) {
        if (leftObject instanceof collisionHandler.left && rightObject instanceof collisionHandler.right) {
            collisionHandler.handler(leftObject, rightObject);
        }
        if (rightObject instanceof collisionHandler.left && leftObject instanceof collisionHandler.right) {
            collisionHandler.handler(rightObject, leftObject);
        }
    });
};

GameWorld.prototype.onCollision = function(leftObjectType, rightObjectType, handler) {
    this.collisionHandlers.push({
        left: leftObjectType,
        right: rightObjectType,
        handler: handler
    });
};

GameWorld.prototype.onSoldierCollision = function(leftSoldier, rightSoldier) {
    // soldiers should bounce off each other
    var distance = VMath.distance(leftSoldier.vec, rightSoldier.vec);
    if (distance === 0) {
        var sub = VMath.scale([Math.random() - Math.random(), Math.random() - Math.random()], 1 / Number.MAX_SAFE_INTEGER);
        leftSoldier.addForce(sub);
        rightSoldier.addForce(VMath.scale(sub, -1));
    } else {
        var sub = VMath.scale(VMath.normalize(VMath.sub(leftSoldier.vec, rightSoldier.vec)), leftSoldier.getWidth() - distance);
        leftSoldier.addForce(VMath.scale(sub, 1 / leftSoldier.weight * rightSoldier.weight));
        rightSoldier.addForce(VMath.scale(sub, -1 * leftSoldier.weight / rightSoldier.weight));
    }
};

GameWorld.prototype.onArrowCollision = function(soldier, arrow) {
    var distance = VMath.distance(arrow.vec, soldier.vec);
    if (arrow.type === "arrow") {
        arrow.hit(soldier, distance);
    } else if (arrow.type === "ball" && soldier.cooldown("ballhit", 150)) {
        arrow.hit(soldier, distance);
        var sub = VMath.scale(VMath.normalize(VMath.sub(soldier.vec, arrow.vec)), soldier.getWidth() - distance);
        soldier.addForce(VMath.scale(sub, -0.5 / soldier.weight * (1 - distance / BALL_RANGE)));
    }
};

/**
 * Updates object
 * @param object
 * @param deltaTime
 */
GameWorld.prototype.updateObject = function(object, deltaTime) {
    object.update(deltaTime);
};

GameWorld.prototype.getAlive = function() {
    return this.queryObjects("Soldier", soldier => soldier.life > 0)
                .reduce((r, soldier) => (r[soldier.color] = (r[soldier.color] || 0) + 1, r), {
                    '#ff0000': 0,
                    '#00ff00': 0
                });
};
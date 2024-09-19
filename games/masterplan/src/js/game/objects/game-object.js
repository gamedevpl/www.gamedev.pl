/**
 * @constructor
 */
function GameObject(x, y, width, height, direction) {
    this.vec = [x, y];
    this.direction = direction;
    this.objectWidth = width;
    this.objectHeight = height;    
}

GameObject.prototype.getTargetVelocity = function() {
    
};

GameObject.prototype.update = function(deltaTime) {
    
};

/**
 * @param {Canvas} canvas
 */
GameObject.prototype.render = function(canvas) {
    canvas.save()       
        .translate(-this.getWidth()/2, -this.getHeight()/2)
        .fillRect(0, 0, this.getWidth(), this.getHeight())
        .restore();
};

GameObject.prototype.getX = function() { 
    return this.vec[0]; 
};
GameObject.prototype.setX = function(x) {
    this.vec[0] = x; 
};

GameObject.prototype.getY = function() { 
    return this.vec[1];
};
GameObject.prototype.setY = function(y) {
    this.vec[1] = y;
};

GameObject.prototype.getDirection = function() { 
    return this.direction; 
};
GameObject.prototype.setDirection = function(direction) {
    this.direction = direction;
};
GameObject.prototype.getWidth = function() { 
    return this.objectWidth; 
};
GameObject.prototype.getHeight = function() { 
    return this.objectHeight;
};
GameObject.prototype.vec = function() {
    return this.vec;
};
GameObject.prototype.getClass = function() {
    return "Object";
};
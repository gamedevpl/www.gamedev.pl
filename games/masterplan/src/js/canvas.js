/**
 * @param {String} layerName
 * @return {Canvas}
 */
function getCanvas(layerName) {
    layerName = layerName || LAYER_DEFAULT;
    
    var canvas = Canvas.layers[layerName];
    
    if (canvas) {
        return canvas;
    }
    
    return (Canvas.layers[layerName] = new Canvas(layerName));
};

function freeCanvas(layerName) {
    layerName = layerName || LAYER_DEFAULT;
    
    var canvas = Canvas.layers[layerName];
    
    if (canvas) {
        canvas.destroy();
        delete Canvas.layers[layerName];
    }
}

/**
 * @param {String} id
 * @constructor
 * @final
 */
function Canvas(id) {
    this.element = document.createElement('canvas');
    this.element.id = id;
    this.ctx = this.element.getContext('2d');
    
    window.addEventListener("resize", this.resize.bind(this));
    this.resize();
    
    document.body.appendChild(this.element);
}

Canvas.layers = { };

Canvas.prototype.destroy = function() {
    document.body.removeChild(this.element)
}

Canvas.prototype.getWidth = function() {
    return this.element.width;
};
    
Canvas.prototype.getHeight = function() {
    return this.element.height;
};
    
Canvas.prototype.clear = function() {
    this.ctx.clearRect(0, 0, this.getWidth(), this.getHeight());
    return this;
};
    
Canvas.prototype.drawText = function(x, y, text) {
    this.ctx.fillStyle = "white";
    this.ctx.font = "11px serif";
    this.ctx.fillText(text, x - this.ctx.measureText(text).width/2, y);
    return this;
};
    
Canvas.prototype.fillStyle = function(fillStyle) {
    this.ctx.fillStyle = fillStyle;
    return this;
};

Canvas.prototype.strokeStyle = function(strokeStyle) {
    this.ctx.strokeStyle = strokeStyle;
    return this;
};
    
Canvas.prototype.fillRect = function(x, y, width, height) {
    this.ctx.fillRect(x, y, width, height);
    return this;
};

Canvas.prototype.arc = function(x, y, radius) {
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI*2);
    this.ctx.stroke();
    return this;
};

Canvas.prototype.line = function(fromX, fromY, toX, toY) {
    this.save();
    this.ctx.beginPath();
    this.ctx.moveTo(fromX, fromY);
    this.ctx.lineTo(toX, toY);
    this.ctx.stroke();
    this.restore();
    return this;
}
    
Canvas.prototype.drawImage = function(image, x, y) {
    this.ctx.drawImage(image, x, y);
    return this;
};
    
Canvas.prototype.scale = function(scale) {
    this.ctx.scale(scale, scale);
    return this;
};

Canvas.prototype.translate = function(x, y) {
    this.ctx.translate(x, y);
    return this;
};
    
Canvas.prototype.rotate = function(direction) {
    this.ctx.rotate(direction);
    return this;
};
    
Canvas.prototype.save = function() {
    this.ctx.save();
    return this;
};
    
Canvas.prototype.restore = function() {
    this.ctx.restore();
    return this;
};
    
Canvas.prototype.ctx = function() {
    return this.ctx;
};

Canvas.prototype.resize = function() {
    this.element.width = window.innerWidth;
    this.element.height = window.innerHeight;
    this.ctx = this.element.getContext('2d');
};  
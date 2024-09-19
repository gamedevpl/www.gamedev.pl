/**
 * @param {GameWorld} world
 * @constructor
 */
function GameHUD(world) {
    this.world = world;
    
    this.HUD = $('#game-hud');
    this.battleTime = $('#battle-time');
    this.battleResult = $('#battle-result');
    this.balanceLeft = $('#battle-balance-left');
    this.balanceRight = $('#battle-balance-right');
    
    this.HUD.style.display = "block";
};

GameHUD.prototype.destroy = function() {
    this.HUD.style.display = "none";
    this.battleResult.innerHTML = '';
};

GameHUD.prototype.getBalance = function(world) {
    var alive = world.getAlive();
    var keys = Object.keys(world.getAlive());
    return alive[keys[0]] / (alive[keys[0]] + alive[keys[1]]);
};

GameHUD.prototype.setNames = function (left, right) {
    this.balanceLeft.dataset["username"] = left || '';
    this.balanceRight.dataset["username"] = right || '';
};

GameHUD.prototype.render = function(world) {
    var secs = 60 - world.getTime() / 1000 << 0;
    var ms = 1000 - world.getTime() % 1000 << 0;
    this.battleTime.dataset["time"] = (secs < 10 ? "0" : "") + secs + ":" + ms;

    var balance = this.getBalance(world);
    this.balanceLeft.style.width = balance * 100 + '%';
    this.balanceLeft.dataset["winning"] = balance > 2/3;
    this.balanceRight.style.width = (1 - balance) * 100 + '%';
    this.balanceRight.dataset["winning"] = balance < 1/3;
};


GameHUD.prototype.renderResults = function(world) {
    var balance = this.getBalance(world);
    var endSpan = "</span>";

    if (balance > 1/3 && balance < 2/3) {
        this.battleResult.innerHTML = `<div style="color: white">
            <span class="result">DRAW!${endSpan}
            <span class="continue">Click to continue${endSpan}
        </div>`;  
    } else {
        var color = balance > 1/3 ? '#ff0000' : '#00ff00';
        this.battleResult.innerHTML = `<div style="color: ${color}">
            <span class="result" style="background: ${color}">${balance > 2/3 ? 'Victory' : 'Defeat'}!${endSpan}
            <span class="winner">${balance > 2/3 ? this.balanceLeft.dataset["username"] : this.balanceRight.dataset["username"]} wins!${endSpan}
            <span class="loser">${balance > 2/3 ? this.balanceRight.dataset["username"] : this.balanceLeft.dataset["username"]} defeated!${endSpan}
            <span class="continue">Click to continue${endSpan}
        </div>`;
        return color;
    }
};

GameHUD.prototype.showPause = function() {
    
};

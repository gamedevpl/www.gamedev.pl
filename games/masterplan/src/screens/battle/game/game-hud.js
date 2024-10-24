export class GameHUD {
  constructor(world) {
    this.world = world;

    this.HUD = document.querySelector('#game-hud');
    this.battleTime = document.querySelector('#battle-time');
    this.battleResult = document.querySelector('#battle-result');
    this.balanceLeft = document.querySelector('#battle-balance-left');
    this.balanceRight = document.querySelector('#battle-balance-right');

    this.HUD.style.display = 'block';
  }

  destroy() {
    this.HUD.style.display = 'none';
    this.battleResult.innerHTML = '';
  }

  getBalance(world) {
    return world.getBalance();
  }

  setNames(left, right) {
    this.balanceLeft.dataset['username'] = left || '';
    this.balanceRight.dataset['username'] = right || '';
  }

  render(world) {
    // Update timer display
    var secs = (60 - world.getTime() / 1000) << 0;
    var ms = ((1000 - (world.getTime() % 1000)) / 10) << 0;
    this.battleTime.dataset['time'] = (secs < 10 ? '0' : '') + secs + ':' + (ms >= 10 ? ms : '0' + ms);

    // Update balance display
    var balance = this.getBalance(world);
    var leftPercentage = Math.round(balance * 100);
    var rightPercentage = Math.round((1 - balance) * 100);

    // Update left balance
    this.balanceLeft.style.maxWidth = leftPercentage + '%';
    this.balanceLeft.dataset['percentage'] = leftPercentage + '%';
    this.balanceLeft.dataset['winning'] = balance > 2 / 3;

    // Update right balance
    this.balanceRight.style.maxWidth = rightPercentage + '%';
    this.balanceRight.dataset['percentage'] = rightPercentage + '%';
    this.balanceRight.dataset['winning'] = balance < 1 / 3;
  }

  renderResults(world) {
    var balance = this.getBalance(world);
    var endSpan = '</span>';

    if (balance > 1 / 3 && balance < 2 / 3) {
      this.battleResult.innerHTML = `<div style="color: white">
                <span class="result">DRAW!${endSpan}
                <span class="continue">Click to continue${endSpan}
            </div>`;
    } else {
      var color = balance > 1 / 3 ? '#ff0000' : '#00ff00';
      this.battleResult.innerHTML = `<div style="color: ${color}">
                <span class="result" style="background: ${color}">${balance > 2 / 3 ? 'Victory' : 'Defeat'}!${endSpan}
                <span class="winner">${
                  balance > 2 / 3 ? this.balanceLeft.dataset['username'] : this.balanceRight.dataset['username']
                } wins!${endSpan}
                <span class="loser">${
                  balance > 2 / 3 ? this.balanceRight.dataset['username'] : this.balanceLeft.dataset['username']
                } defeated!${endSpan}
                <span class="continue">Click to continue${endSpan}
            </div>`;
      return color;
    }
  }

  showPause() {}
}

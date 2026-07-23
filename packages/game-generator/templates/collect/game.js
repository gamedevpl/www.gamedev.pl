// __TITLE__ — catch the falling coins. __DESCRIPTION__
(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const basket = { w: 60, h: 44, x: W / 2 - 30, y: H - 60, speed: 7 };
  const coins = [];
  const keys = {};
  const TARGET = 15;
  const COIN_R = 12;

  let score = 0;
  let missed = 0;
  let spawnTimer = 0;
  let state = 'playing'; // 'playing' | 'won' | 'lost'
  let last = performance.now();

  window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.preventDefault) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
  });

  function spawnCoin() {
    coins.push({ x: COIN_R + Math.random() * (W - COIN_R * 2), y: -COIN_R, r: COIN_R, vy: 2.2 + Math.random() * 2.4 });
  }

  // Circle vs. basket rectangle overlap (closest-point test).
  function caught(coin) {
    const nx = Math.max(basket.x, Math.min(coin.x, basket.x + basket.w));
    const ny = Math.max(basket.y, Math.min(coin.y, basket.y + basket.h));
    const dx = coin.x - nx;
    const dy = coin.y - ny;
    return dx * dx + dy * dy <= coin.r * coin.r;
  }

  function update(dt) {
    if (state !== 'playing') return;

    if (keys['ArrowLeft']) basket.x -= basket.speed;
    if (keys['ArrowRight']) basket.x += basket.speed;
    basket.x = Math.max(0, Math.min(W - basket.w, basket.x));

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnCoin();
      spawnTimer = 620;
    }

    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      c.y += c.vy;
      if (caught(c)) {
        coins.splice(i, 1);
        score += 1;
        if (score >= TARGET) state = 'won';
        continue;
      }
      // Remove coins once they fully drop past the bottom edge.
      if (c.y - c.r > H) {
        coins.splice(i, 1);
        missed += 1;
        if (missed >= 8) state = 'lost';
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '22px system-ui, sans-serif';
    for (const c of coins) ctx.fillText('🪙', c.x, c.y);

    ctx.font = '40px system-ui, sans-serif';
    ctx.fillText('🧺', basket.x + basket.w / 2, basket.y + basket.h / 2);

    ctx.fillStyle = '#e8e8f0';
    ctx.font = '16px system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText('Score: ' + score + ' / ' + TARGET, 12, 24);
    ctx.textAlign = 'right';
    ctx.fillText('Missed: ' + missed + ' / 8', W - 12, 24);

    if (state !== 'playing') {
      ctx.fillStyle = 'rgba(8,12,8,0.72)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = state === 'won' ? '#ffd257' : '#f04e6a';
      ctx.textAlign = 'center';
      ctx.font = 'bold 34px system-ui, sans-serif';
      ctx.fillText(state === 'won' ? 'You Win!' : 'Too Many Missed', W / 2, H / 2 - 10);
      ctx.fillStyle = '#e8e8f0';
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillText('Coins caught: ' + score, W / 2, H / 2 + 26);
    }
  }

  function loop(now) {
    const dt = now - last;
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();

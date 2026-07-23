// __TITLE__ — dodge the falling hazards. __DESCRIPTION__
(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const player = { w: 52, h: 16, x: W / 2 - 26, y: H - 40, speed: 6 };
  const hazards = [];
  const keys = {};
  const SURVIVE_MS = 25000;

  let score = 0;
  let elapsed = 0;
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

  function spawnHazard() {
    const w = 24 + Math.random() * 40;
    hazards.push({ x: Math.random() * (W - w), y: -30, w, h: 20, vy: 2.4 + Math.random() * 2.6 });
  }

  function hit(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function update(dt) {
    if (state !== 'playing') return;
    elapsed += dt;

    if (keys['ArrowLeft']) player.x -= player.speed;
    if (keys['ArrowRight']) player.x += player.speed;
    player.x = Math.max(0, Math.min(W - player.w, player.x));

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnHazard();
      spawnTimer = Math.max(220, 700 - elapsed / 40);
    }

    for (let i = hazards.length - 1; i >= 0; i--) {
      const hz = hazards[i];
      hz.y += hz.vy;
      if (hit(player, hz)) {
        state = 'lost';
        return;
      }
      // Remove hazards once they fully exit the canvas so they can't accumulate.
      if (hz.y > H) {
        hazards.splice(i, 1);
        score += 1;
      }
    }

    if (elapsed >= SURVIVE_MS) state = 'won';
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = '#f04e6a';
    for (const hz of hazards) ctx.fillRect(hz.x, hz.y, hz.w, hz.h);

    ctx.fillStyle = '#4ec3f0';
    ctx.fillRect(player.x, player.y, player.w, player.h);

    ctx.fillStyle = '#e8e8f0';
    ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Score: ' + score, 12, 24);
    const left = Math.max(0, Math.ceil((SURVIVE_MS - elapsed) / 1000));
    ctx.textAlign = 'right';
    ctx.fillText('Time: ' + left + 's', W - 12, 24);

    if (state !== 'playing') {
      ctx.fillStyle = 'rgba(8,10,18,0.72)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = state === 'won' ? '#67e08a' : '#f04e6a';
      ctx.textAlign = 'center';
      ctx.font = 'bold 34px system-ui, sans-serif';
      ctx.fillText(state === 'won' ? 'You Survived!' : 'Game Over', W / 2, H / 2 - 10);
      ctx.fillStyle = '#e8e8f0';
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillText('Final score: ' + score, W / 2, H / 2 + 26);
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

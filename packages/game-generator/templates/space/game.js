// __TITLE__ — pilot the ship and dodge asteroids. __DESCRIPTION__
(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const ship = { x: W / 2, y: H - 90, r: 14, speed: 5 };
  const asteroids = [];
  const stars = [];
  const keys = {};
  const SURVIVE_MS = 30000;

  let score = 0;
  let elapsed = 0;
  let spawnTimer = 0;
  let state = 'playing'; // 'playing' | 'won' | 'lost'
  let last = performance.now();

  for (let i = 0; i < 40; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 1.5 + 0.3 });

  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(e.key.toLowerCase()) && e.preventDefault)
      e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  function spawnAsteroid() {
    const r = 12 + Math.random() * 20;
    asteroids.push({
      x: r + Math.random() * (W - r * 2),
      y: -r,
      r,
      vy: 2 + Math.random() * 2.8,
      vx: (Math.random() - 0.5) * 1.2,
    });
  }

  function collide(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const rr = a.r + b.r;
    return dx * dx + dy * dy <= rr * rr;
  }

  function update(dt) {
    if (state !== 'playing') return;
    elapsed += dt;

    if (keys['arrowleft'] || keys['a']) ship.x -= ship.speed;
    if (keys['arrowright'] || keys['d']) ship.x += ship.speed;
    if (keys['arrowup'] || keys['w']) ship.y -= ship.speed;
    if (keys['arrowdown'] || keys['s']) ship.y += ship.speed;
    // Wrap around every edge.
    if (ship.x < 0) ship.x = W;
    if (ship.x > W) ship.x = 0;
    if (ship.y < 0) ship.y = H;
    if (ship.y > H) ship.y = 0;

    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      spawnAsteroid();
      spawnTimer = Math.max(260, 640 - elapsed / 50);
    }

    for (let i = asteroids.length - 1; i >= 0; i--) {
      const a = asteroids[i];
      a.y += a.vy;
      a.x += a.vx;
      if (collide(ship, a)) {
        state = 'lost';
        return;
      }
      // Remove asteroids once they fully leave the canvas so they never pile up.
      if (a.y - a.r > H || a.x + a.r < 0 || a.x - a.r > W) {
        asteroids.splice(i, 1);
        score += 1;
      }
    }

    if (elapsed >= SURVIVE_MS) state = 'won';
  }

  function drawShip() {
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.fillStyle = '#6ad0ff';
    ctx.beginPath();
    ctx.moveTo(0, -ship.r);
    ctx.lineTo(ship.r * 0.8, ship.r);
    ctx.lineTo(0, ship.r * 0.4);
    ctx.lineTo(-ship.r * 0.8, ship.r);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = '#8890c0';
    for (const st of stars) ctx.fillRect(st.x, st.y, st.s, st.s);

    ctx.fillStyle = '#b06a3c';
    for (const a of asteroids) {
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
      ctx.fill();
    }

    drawShip();

    ctx.fillStyle = '#e8e8f0';
    ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Score: ' + score, 12, 24);
    const left = Math.max(0, Math.ceil((SURVIVE_MS - elapsed) / 1000));
    ctx.textAlign = 'right';
    ctx.fillText('Time: ' + left + 's', W - 12, 24);

    if (state !== 'playing') {
      ctx.fillStyle = 'rgba(3,4,10,0.75)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = state === 'won' ? '#67e08a' : '#f04e6a';
      ctx.textAlign = 'center';
      ctx.font = 'bold 34px system-ui, sans-serif';
      ctx.fillText(state === 'won' ? 'You Survived!' : 'Ship Destroyed', W / 2, H / 2 - 10);
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

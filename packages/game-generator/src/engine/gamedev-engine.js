/**
 * gamedev-engine.js — Ultra-lightweight 2D Arcade Game Engine for gamedev.pl
 * Zero dependencies, sandbox safe, auto-scaling, delta-time game loop,
 * unified input, AABB physics, particle system, camera juice, and HUD.
 */
(function (global) {
  'use strict';

  class InputManager {
    constructor() {
      this.keys = {};
      this.justPressedKeys = {};
      this.axisX = 0;
      this.axisY = 0;

      window.addEventListener('keydown', (e) => {
        if (!this.keys[e.code]) {
          this.justPressedKeys[e.code] = true;
        }
        this.keys[e.code] = true;
        this._updateAxes();
      });

      window.addEventListener('keyup', (e) => {
        this.keys[e.code] = false;
        this._updateAxes();
      });
    }

    _updateAxes() {
      let x = 0;
      let y = 0;
      if (this.keys['ArrowLeft'] || this.keys['KeyA']) x -= 1;
      if (this.keys['ArrowRight'] || this.keys['KeyD']) x += 1;
      if (this.keys['ArrowUp'] || this.keys['KeyW']) y -= 1;
      if (this.keys['ArrowDown'] || this.keys['KeyS']) y += 1;
      this.axisX = x;
      this.axisY = y;
    }

    isDown(code) {
      return !!this.keys[code];
    }

    justPressed(code) {
      if (code === 'action') {
        return (
          !!this.justPressedKeys['Space'] ||
          !!this.justPressedKeys['KeyZ'] ||
          !!this.justPressedKeys['KeyX'] ||
          !!this.justPressedKeys['Enter']
        );
      }
      return !!this.justPressedKeys[code];
    }

    clearJustPressed() {
      this.justPressedKeys = {};
    }
  }

  class ParticleSystem {
    constructor() {
      this.particles = [];
    }

    emit({ x, y, color = '#FFEC27', count = 10, speed = 100, life = 0.5, size = 3 }) {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = (Math.random() * 0.8 + 0.2) * speed;
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          color,
          life,
          maxLife: life,
          size: Math.random() * size + 1,
        });
      }
    }

    update(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          this.particles.splice(i, 1);
        } else {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
      }
    }

    render(ctx) {
      for (const p of this.particles) {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillRect(Math.round(p.x - p.size / 2), Math.round(p.y - p.size / 2), p.size, p.size);
      }
      ctx.globalAlpha = 1.0;
    }
  }

  class CameraManager {
    constructor() {
      this.shakeIntensity = 0;
      this.shakeDuration = 0;
      this.shakeTimer = 0;
      this.offsetX = 0;
      this.offsetY = 0;
    }

    shake({ intensity = 5, duration = 0.3 } = {}) {
      this.shakeIntensity = intensity;
      this.shakeDuration = duration;
      this.shakeTimer = duration;
    }

    update(dt) {
      if (this.shakeTimer > 0) {
        this.shakeTimer -= dt;
        const factor = this.shakeTimer / this.shakeDuration;
        this.offsetX = (Math.random() * 2 - 1) * this.shakeIntensity * factor;
        this.offsetY = (Math.random() * 2 - 1) * this.shakeIntensity * factor;
      } else {
        this.offsetX = 0;
        this.offsetY = 0;
      }
    }
  }

  class Entity {
    constructor({ x = 0, y = 0, width = 16, height = 16, sprite = null, color = '#00E756' } = {}) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
      this.vx = 0;
      this.vy = 0;
      this.sprite = sprite;
      this.color = color;
      this.destroyed = false;
      this.frame = 0;
      this.animTimer = 0;
    }

    move(vx, vy) {
      this.vx = vx;
      this.vy = vy;
    }

    destroy() {
      this.destroyed = true;
    }

    getBounds() {
      return {
        x: this.x,
        y: this.y,
        width: this.width,
        height: this.height,
      };
    }

    update(dt) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.animTimer += dt;
      if (this.animTimer >= 0.15) {
        this.animTimer = 0;
        this.frame = (this.frame + 1) % 4;
      }
    }

    render(ctx) {
      if (this.sprite && typeof this.sprite.draw === 'function') {
        this.sprite.draw(ctx, Math.round(this.x), Math.round(this.y), this.frame);
      } else {
        ctx.fillStyle = this.color;
        ctx.fillRect(Math.round(this.x), Math.round(this.y), this.width, this.height);
      }
    }
  }

  class Group {
    constructor() {
      this.children = [];
    }

    add(entity) {
      this.children.push(entity);
      return entity;
    }

    update(dt) {
      for (let i = this.children.length - 1; i >= 0; i--) {
        const child = this.children[i];
        if (child.destroyed) {
          this.children.splice(i, 1);
        } else {
          child.update(dt);
        }
      }
    }

    render(ctx) {
      for (const child of this.children) {
        if (!child.destroyed) {
          child.render(ctx);
        }
      }
    }
  }

  class PhysicsManager {
    static checkOverlap(a, b) {
      const rA = a.getBounds ? a.getBounds() : a;
      const rB = b.getBounds ? b.getBounds() : b;
      return rA.x < rB.x + rB.width && rA.x + rA.width > rB.x && rA.y < rB.y + rB.height && rA.y + rA.height > rB.y;
    }

    overlap(targetA, targetB, callback) {
      const listA = targetA instanceof Group ? targetA.children : [targetA];
      const listB = targetB instanceof Group ? targetB.children : [targetB];

      for (const a of listA) {
        if (a.destroyed) continue;
        for (const b of listB) {
          if (b.destroyed) continue;
          if (PhysicsManager.checkOverlap(a, b)) {
            callback(a, b);
          }
        }
      }
    }
  }

  class GameApp {
    constructor(config = {}) {
      this.title = config.title || 'Arcade Game';
      this.width = config.width || 800;
      this.height = config.height || 600;
      this.bgColor = config.bgColor || '#1D2B53';

      this.score = 0;
      this.lives = config.lives !== undefined ? config.lives : 3;
      this.state = 'play'; // 'title', 'play', 'gameover'

      this.input = new InputManager();
      this.particles = new ParticleSystem();
      this.camera = new CameraManager();
      this.physics = new PhysicsManager();

      this.entities = new Group();
      this.updateCallbacks = [];
      this.renderCallbacks = [];

      this.lastTime = 0;
      this._setupCanvas();
    }

    _setupCanvas() {
      let canvas = document.getElementById('game-canvas');
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'game-canvas';
        document.body.appendChild(canvas);
      }
      canvas.width = this.width;
      canvas.height = this.height;
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');

      // CSS for crisp pixel scaling & letterboxing
      const style = document.createElement('style');
      style.textContent = `
        html, body {
          margin: 0; padding: 0; width: 100%; height: 100%;
          background: #000; overflow: hidden;
          display: flex; align-items: center; justify-content: center;
          font-family: monospace, sans-serif;
        }
        #game-canvas {
          max-width: 100%; max-height: 100%;
          object-fit: contain;
          image-rendering: pixelated; image-rendering: crisp-edges;
        }
      `;
      document.head.appendChild(style);
    }

    createEntity(config) {
      const entity = new Entity(config);
      this.entities.add(entity);
      return entity;
    }

    createGroup() {
      const group = new Group();
      this.entities.add(group);
      return group;
    }

    onUpdate(fn) {
      this.updateCallbacks.push(fn);
    }

    onRender(fn) {
      this.renderCallbacks.push(fn);
    }

    gameOver() {
      this.state = 'gameover';
    }

    reset() {
      this.score = 0;
      this.lives = 3;
      this.state = 'play';
      this.entities.children = [];
    }

    _loop(timestamp) {
      if (!this.lastTime) this.lastTime = timestamp;
      let dt = (timestamp - this.lastTime) / 1000;
      this.lastTime = timestamp;

      // Clamp delta time to avoid huge leaps after tab defocus
      if (dt > 0.1) dt = 0.1;

      // Update
      this.camera.update(dt);
      this.particles.update(dt);

      if (this.state === 'play') {
        this.entities.update(dt);
        for (const cb of this.updateCallbacks) {
          cb(dt);
        }
      } else if (this.state === 'gameover') {
        if (this.input.justPressed('action')) {
          this.reset();
        }
      }

      // Render
      this.ctx.save();
      this.ctx.fillStyle = this.bgColor;
      this.ctx.fillRect(0, 0, this.width, this.height);

      this.ctx.translate(Math.round(this.camera.offsetX), Math.round(this.camera.offsetY));

      this.entities.render(this.ctx);
      this.particles.render(this.ctx);

      for (const cb of this.renderCallbacks) {
        cb(this.ctx);
      }

      this.ctx.restore();

      // Render HUD
      this._renderHUD();

      this.input.clearJustPressed();
      requestAnimationFrame((ts) => this._loop(ts));
    }

    _renderHUD() {
      this.ctx.save();
      this.ctx.font = 'bold 20px monospace';
      this.ctx.fillStyle = '#FFF1E8';
      this.ctx.shadowColor = '#000';
      this.ctx.shadowBlur = 4;

      // Score
      this.ctx.fillText(`SCORE: ${this.score}`, 20, 32);

      // Lives
      if (this.lives > 0) {
        this.ctx.fillText(`LIVES: ${this.lives}`, this.width - 120, 32);
      }

      // Game Over Screen
      if (this.state === 'gameover') {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        this.ctx.fillRect(0, 0, this.width, this.height);

        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#FF004D';
        this.ctx.font = 'bold 48px monospace';
        this.ctx.fillText('GAME OVER', this.width / 2, this.height / 2 - 20);

        this.ctx.fillStyle = '#FFEC27';
        this.ctx.font = '20px monospace';
        this.ctx.fillText('Press SPACE / Z / ENTER to Restart', this.width / 2, this.height / 2 + 30);
      }

      this.ctx.restore();
    }

    start() {
      requestAnimationFrame((ts) => this._loop(ts));
    }
  }

  global.Gamedev = {
    init: (config) => new GameApp(config),
    App: GameApp,
    Entity,
    Group,
  };
})(typeof window !== 'undefined' ? window : globalThis);

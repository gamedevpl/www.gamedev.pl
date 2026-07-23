---
name: game-asset-generation
description: Skill for coding agents to dynamically generate, style, and compose 2D game assets (sprites, audio, UI) tailored to any game specification.
---

# Game Asset Generation Skill

Guidance for coding agents (Claude Code, GitHub Copilot, Codex, Antigravity) generating HTML5 games for `gamedev.pl`.

Instead of hardcoding fixed workflows or static asset files, use this skill to dynamically analyze a game spec, determine required visual and audio assets, and synthesize them on-the-fly.

---

## 🎨 Asset Generation Workflow

When given a game spec (e.g., "A retro space shooter with laser beams and asteroid fields"):

### 1. Identify Required Asset Categories

Break down the spec into core game entities:

- **Player Character**: Ship, hero, vehicle, or avatar.
- **Enemies / Obstacles**: Asteroids, aliens, traps, falling rocks.
- **Collectibles**: Coins, gems, power-ups, energy cells.
- **Environment & Particles**: Starfield, parallax background, explosions, trails.
- **Audio Sound Effects**: Action feedback (`shoot`, `collect`, `hit`, `explosion`).

### 2. Choose the Optimal Asset Strategy

| Requirement                       | Best Technique                 | Implementation                                              |
| :-------------------------------- | :----------------------------- | :---------------------------------------------------------- |
| **Pixel Art / Retro Sprites**     | Procedural Canvas Rendering    | Pre-render onto an offscreen canvas at boot.                |
| **Vector / Smooth Graphics**      | SVG / Canvas Paths             | Render clean geometric paths with gradients & glows.        |
| **Rich Textures / Illustrations** | `generate_image` Tool / AI Art | Generate raster images & embed as data URLs or local files. |
| **Sound Effects**                 | Web Audio API Synthesizer      | Synthesize in-memory audio without network calls.           |

---

## 🖌️ Procedural Canvas Asset Pattern

When generating sprites via Canvas code, pre-render animation frames onto offscreen canvases at boot for 60fps performance:

```javascript
// Pre-render sprite frames in-memory
function createShipSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');

  // Draw vibrant ship
  ctx.fillStyle = '#29ADFF';
  ctx.beginPath();
  ctx.moveTo(16, 2);
  ctx.lineTo(30, 28);
  ctx.lineTo(16, 22);
  ctx.lineTo(2, 28);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#FFA300';
  ctx.fillRect(12, 22, 8, 8); // Thruster glow

  return canvas;
}
```

---

## 🎵 Web Audio Sound Effect Patterns

Always generate sound effects in-memory using the Web Audio API. Never require external `.wav`/`.mp3` downloads.

```javascript
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;

  if (type === 'coin') {
    osc.frequency.setValueAtTime(987, now);
    osc.frequency.setValueAtTime(1318, now + 0.08);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.2);
  } else if (type === 'laser') {
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.15);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc.start(now);
    osc.stop(now + 0.15);
  }
}
```

---

## 🌈 Design & Palette Rules

1. **Use Harmonious Color Palettes**: Use cohesive palettes (e.g., PICO-8 16-color, Cyberpunk Neon, or HSL-tailored schemes). Avoid raw unstyled primary red/blue/green.
2. **Resolution Letterboxing**: Use virtual fixed resolution (e.g. 800×600) scaled via CSS `object-fit: contain` and `image-rendering: pixelated`.
3. **Screen Juice**: Add camera shake on impacts (`camera.shake()`), particle bursts on destruction, and floating score popups for satisfying player feedback.

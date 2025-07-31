# Emoji Sprites

This directory contains 32x32 pixel PNG sprites that replace Unicode emoji rendering throughout the tribe game.

## Naming Convention

Sprite files use descriptive snake_case names rather than Unicode characters:
- `crown.png` - 👑 (tribe badge)
- `skull.png` - 💀 (tribe badge)
- `handshake.png` - 🤝 (friendly diplomacy)
- `crossed_swords.png` - ⚔️ (hostile diplomacy or attack action)

## Sprite Categories

### Tribe Badge Sprites
Used for identifying different tribes in the game:
- `crown.png` - 👑 Royal/leadership tribe
- `skull.png` - 💀 Death/warrior tribe  
- `fire.png` - 🔥 Fire tribe
- `water_drop.png` - 💧 Water tribe
- `shamrock.png` - ☘️ Nature/luck tribe
- `sun.png` - ☀️ Solar tribe
- `crescent_moon.png` - 🌙 Lunar tribe
- `star.png` - ⭐ Star tribe
- `lightning.png` - ⚡ Storm tribe
- `fleur_de_lis.png` - ⚜️ Noble tribe

### Diplomacy Status Sprites
Used in tribe list UI to show relationships:
- `handshake.png` - 🤝 Friendly status
- `crossed_swords.png` - ⚔️ Hostile status

### Player Action Sprites
Used for player commands and autopilot actions:
- `raised_hand.png` - ✋ Gather action
- `meat.png` - 🍖 Eat action  
- `heart.png` - ❤️ Procreate action
- `crossed_swords.png` - ⚔️ Attack action (reused)
- `seedling.png` - 🌱 Plant action
- `megaphone.png` - 📢 Call to attack
- `trident.png` - 🔱 Split tribe
- `right_arrow.png` - ➡️ Follow me
- `man_feeding_child.png` - 👨‍👧 Feed child
- `bullseye.png` - 🎯 Autopilot move

### Status Indicator Sprites
Used in UI status bars and displays:
- `calendar.png` - 🗓️ Time indicator
- `meat.png` - 🍖 Hunger indicator (reused)
- `heart.png` - ❤️ Hitpoints indicator (reused)
- `strawberry.png` - 🍓 Food indicator
- `robot.png` - 🤖 Autopilot indicator

### Visual Effect Sprites
Used for floating visual effects during gameplay:
- `baby_bottle.png` - 🍼 Child fed effect
- `shield.png` - 🛡️ Attack deflected effect
- `muscle.png` - 💪 Attack resisted effect
- `explosion.png` - 💥 Hit effect

## Usage in Code

### Main Files Using Sprites:
- `src/game/render/render-effects.ts` - Visual effects rendering
- `src/game/render/ui/render-tribe-list.ts` - Tribe badges and diplomacy
- `src/game/render/ui/render-buttons.ts` - Player action buttons
- `src/game/render/ui/render-top-left-panel.ts` - Status indicators
- `src/game/ui/ui-types.ts` - Emoji mappings configuration

### Sprite Loading:
Sprites are loaded through `src/game/sprites/sprite-loader.ts` which preloads all images and provides a sprite cache for rendering functions.

### Rendering:
The `drawSprite()` function replaces `ctx.fillText()` calls for emoji rendering, supporting the same positioning and scaling used by the original emoji system.

## Technical Notes

- All sprites are 32x32 pixels with transparent backgrounds
- PNG format for best quality and transparency support
- Sprites use distinctive colors and shapes for clear recognition
- Fallback system in place for missing sprites (shows colored circle with letter)
- Compatible with existing floating effect animations (fade, rise up, etc.)
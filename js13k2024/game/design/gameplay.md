# Monster Steps - Gameplay Design Document

## Core Concept
"Monster Steps" is a strategic puzzle game where players must navigate from point A to point B on a grid while avoiding monsters that appear every 13th step. The game embodies the theme of triskaidekaphobia (fear of the number 13) through its core mechanics.

## Game Mechanics

### Grid System
- The game takes place on a grid-based map.
- Each cell on the grid represents one step.
- The grid size can vary per level, typically ranging from 8x8 to 15x15.

### Player Movement
- Players can move in four directions: up, down, left, and right.
- Diagonal movements are not allowed.
- Each move counts as one step.

### Step Counter
- A prominent step counter is displayed on the screen.
- It increments with each move the player makes.

### Monster Summoning
- A monster is summoned every time the step counter reaches a multiple of 13.
- The monster appears on the last cell the player occupied before the 13th step.

### Monster Behavior
- Monsters follow the exact path the player took, starting from their spawn point.
- They move one step for every step the player takes.
- If a monster reaches the player's current position, the game ends.

### Obstacles
- Some grid cells may contain obstacles that cannot be passed through.
- Obstacles can be used strategically to block monster paths.

### Goal
- Each level has a clearly marked goal cell.
- The player must reach this cell to complete the level.

### Level Design
- Levels progressively increase in difficulty.
- Early levels introduce core concepts (movement, monster spawning).
- Later levels incorporate more complex layouts and multiple monsters.

## Scoring System

### Points
- Base points are awarded for completing a level.
- Bonus points are given for:
  - Completing the level in fewer steps
  - Narrowly avoiding monsters (passing adjacent to them)

### Time Bonus
- A timer runs during gameplay.
- Completing levels quickly awards additional bonus points.

### Streak Bonus
- Completing multiple levels without failing increases a multiplier.
- This encourages extended play sessions and mastery.

## Player Interactions

### Controls
- Arrow keys or WASD for movement
- Space bar or Enter to confirm actions (e.g., start game, pause)
- Escape key to pause the game

### Planning Mode
- Players can enter a "planning mode" where they can plot their path without actually moving.
- This allows for strategy development without the risk of summoning monsters.

### Undo Feature
- Limited "undo" moves are available per level.
- This adds a strategic element and allows for some error correction.

## Power-ups (Optional, if space allows)

### Step Eraser
- Removes the last step from the counter, potentially delaying monster spawns.

### Monster Freeze
- Temporarily stops all monsters for a few moves.

### Teleport
- Allows the player to jump to a nearby cell without incrementing the step counter.

## Challenge Modes

### Endless Mode
- Continuous play on a large or procedurally generated grid.
- The goal is to survive as long as possible with an ever-increasing number of monsters.

### Speed Run
- Complete a series of levels as quickly as possible.
- Emphasizes quick thinking and efficient pathing.

## Tutorial

- An interactive tutorial level introduces core mechanics.
- Pop-up hints appear in early levels to guide new players.

## Difficulty Progression

1. Introduction of basic movement and goal reaching.
2. Introduction of the 13-step monster spawn mechanic.
3. Introduction of obstacles and more complex grid layouts.
4. Multiple monsters and limited "safe" paths.
5. Timed levels with multiple goals to reach.
6. Complex layouts requiring precise planning and execution.

This gameplay design aims to create a tense, strategic experience that constantly reminds players of the "13" threat, embodying the theme of triskaidekaphobia while providing engaging and progressively challenging gameplay.
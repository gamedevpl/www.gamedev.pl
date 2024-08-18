# Monster Steps - Gameplay Design Document

## Core Concept
"Monster Steps" is a strategic puzzle game where players must navigate from point A to point B on a grid while avoiding monsters that appear every 13th step. The game embodies the theme of triskaidekaphobia (fear of the number 13) through its core mechanics.

## Game Mechanics

### Grid System
- The game takes place on a grid-based map.
- Each cell on the grid represents one step.
- The grid size varies per level, ranging from 7x7 to 16x16.

### Player Movement
- Players can move in four directions: up, down, left, and right.
- Diagonal movements are not allowed.
- Each move counts as one step.

### Step Counter
- A prominent step counter is displayed on the screen.
- It increments with each move the player makes.

### Monster Summoning
- A monster is summoned every time the step counter reaches a multiple of 13.
- The monster appears on a predetermined position based on the level design.

### Monster Behavior
- Monsters follow a predetermined path or behavior based on the level design.
- They move one step for every step the player takes.
- If a monster reaches the player's current position, the game ends.

### Obstacles
- Some grid cells contain obstacles that cannot be passed through.
- Obstacles can be used strategically to block monster paths.

### Goal
- Each level has a clearly marked goal cell.
- The player must reach this cell to complete the level.

### Level Design
- The game features 13 deterministically generated levels.
- Each level has a unique layout, set of obstacles, monsters, and bonuses.
- Levels progressively increase in difficulty and complexity.

## Bonus Types and Effects

### Cap of Invisibility
- Makes the player invisible to monsters for a limited time.
- Monsters will not chase the player while this bonus is active.

### Confused Monsters
- Causes monsters to move erratically or in opposite directions.
- Lasts for a limited number of turns.

### Land Mine
- Allows the player to place a land mine on their current position.
- Destroys any monster that steps on it.

### Time Bomb
- Places a bomb that explodes after a set number of turns.
- Destroys monsters and obstacles in its blast radius.

### Crusher
- Allows the player to destroy obstacles by moving into them.
- Active for a limited number of turns.

### Builder
- Enables the player to create new obstacles.
- Can be used to block monster paths or create safe zones.

## Scoring System

### Points
- Base points are awarded for completing a level.
- Bonus points are given for:
  - Completing the level in fewer steps
  - Effectively using bonuses

### Time Bonus
- A timer runs during gameplay.
- Completing levels quickly awards additional bonus points.

## Player Interactions

### Controls
- Arrow keys or WASD for movement
- Space bar or Enter to confirm actions (e.g., start game, pause)
- Escape key to pause the game

### Planning Mode
- Players can strategize their moves based on the level layout and available bonuses.

## Challenge Modes

### Progressive Difficulty
- Each of the 13 levels introduces new challenges and combinations of bonuses.
- The final level (13th) is designed to be particularly challenging, requiring mastery of all game mechanics.

## Tutorial

- The first level serves as an interactive tutorial, introducing core mechanics.
- Each new bonus type is introduced gradually through the levels, allowing players to learn their effects.

## Difficulty Progression

1. Introduction of basic movement and goal reaching.
2. Introduction of the 13-step monster spawn mechanic.
3. Introduction of obstacles and more complex grid layouts.
4. Introduction of various bonus types one by one.
5. Combining multiple bonus types and increasing monster count.
6. Complex layouts requiring precise planning and execution of bonus usage.
7. The final level combining all learned mechanics in a challenging setup.

This gameplay design creates a tense, strategic experience that constantly reminds players of the "13" threat, embodying the theme of triskaidekaphobia while providing engaging and progressively challenging gameplay through 13 unique levels.
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

### Climber
- Allows the player to move over obstacles for a limited time.
- Duration: 13 steps (like other bonuses).
- Strategic considerations:
  - Enables access to previously unreachable areas.
  - Can be used to escape monsters by climbing over obstacles.
  - Allows for shortcuts through the level, potentially reducing the number of steps taken.
  - Can be combined with other bonuses (e.g., Builder) for advanced strategies.
  - Players must plan carefully to make the most of the limited duration.

### Teleport
- Instantly moves the player to another location on the grid.
- Useful for quick escapes or reaching distant areas.
- May be strategically placed to help or hinder the player's progress.

### Tsunami
- Gradually floods the grid with water over 13 steps.
- Effects:
  - Step 1-6: Water starts to appear, slowing down player and monster movement slightly.
  - Step 7-12: Water level rises, further slowing movement and making lower areas dangerous.
  - Step 13: Full flood, eliminating all entities (player and monsters) not on elevated positions.
- Interactions:
  - Climber bonus allows the player to survive on obstacles during a flood.
  - Can be used strategically to eliminate multiple monsters at once.
  - Changes the dynamics of the level, forcing players to seek higher ground.

### Monster
- Transforms the player into a monster for 13 steps.
- Effects:
  - Player gains the appearance and some abilities of a monster.
  - Existing monsters become vulnerable "players" during this time.
  - The goal changes: eliminate all monster-players to win the level.
  - If any monster-player reaches the original goal, it's game over.
- Strategic considerations:
  - Completely changes the gameplay dynamic for a short period.
  - Requires quick thinking and adaptation from the player.
  - Can be used to clear the level of monsters if used skillfully.

### Slide
- Changes the player's movement to a continuous slide until hitting an obstacle or grid edge.
- Effects:
  - Player moves in the chosen direction until stopped by an obstacle or the grid boundary.
  - Allows for quick traversal of open areas.
  - Can potentially slide past monsters without being caught.
- Strategic considerations:
  - Requires careful planning to avoid sliding into dangerous situations.
  - Can be combined with other bonuses for interesting effects (e.g., Slide + Crusher).
  - Useful for quickly reaching distant bonuses or the goal.

### Sokoban
- Grants the player the ability to push obstacles.
- Effects:
  - Player can move obstacles by pushing them.
  - Pushed obstacles can crush monsters, eliminating them.
  - Allows for reshaping the level layout.
- Strategic considerations:
  - Can be used to create new paths or block existing ones.
  - Pushing obstacles strategically can help manage monster movements.
  - Requires spatial awareness and forward-thinking.

### Blaster
- Equips the player with a blaster that shoots in the direction of movement.
- Effects:
  - When the player moves, a blast is fired in the same direction.
  - Blasts can eliminate monsters in their path.
  - Does not affect obstacles.
- Strategic considerations:
  - Allows for offensive play against monsters.
  - Requires planning to line up shots effectively.
  - Can be used to clear a path to the goal.

## Scoring System

### Points
- Base points are awarded for completing a level.
- Bonus points are given for:
  - Completing the level in fewer steps
  - Effectively using bonuses
  - Eliminating monsters (with new bonuses like Blaster or Monster transformation)

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
7. Introduction of new bonuses (Tsunami, Monster, Slide, Sokoban, Blaster) in later levels.
8. Levels designed to specifically challenge players with new bonus mechanics.
9. Combining new and old bonuses for complex puzzle solutions.
10. Increased monster spawn rate or initial count to raise difficulty.
11. Tighter time constraints for achieving higher scores.
12. Levels with limited bonuses, requiring perfect use of available resources.
13. The final level combining all learned mechanics in a challenging setup.

This gameplay design creates a tense, strategic experience that constantly reminds players of the "13" threat, embodying the theme of triskaidekaphobia while providing engaging and progressively challenging gameplay through 13 unique levels. The addition of new bonuses like Tsunami, Monster, Slide, Sokoban, and Blaster adds layers of complexity and strategic depth to the game, ensuring a rich and varied player experience.
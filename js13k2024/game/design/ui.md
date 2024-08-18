# Monster Steps - UI Design Document

## Overall Design Philosophy
The UI for Monster Steps will be minimalistic and clean, focusing on essential information and intuitive controls. We'll use simple geometric shapes and a limited color palette to stay within the 13KB size limit while maintaining visual clarity.

## Color Palette
- Background: Light gray (#E0E0E0)
- Grid lines: Dark gray (#404040)
- Player: Green (#00FF00)
- Monsters: Purple (#800080)
- Goal: Red (#FF0000)
- UI elements: Black (#000000)
- Highlight/Warning: Yellow (#FFFF00)
- Bonuses: Cyan (#00FFFF)

## Screens

### 1. Title Screen
- Game title "Monster Steps" in large, pixelated font
- "Press Any Key to Start" text pulsating slowly
- Simplified grid in the background with animated player and monster

### 2. Main Game Screen
- Grid-based play area (majority of the screen)
- Minimalistic HUD elements (top and bottom of the screen)

### 3. Pause Screen
- Darkened overlay on the game screen
- "PAUSED" text in the center
- Options: "Resume", "Restart", "Quit"

### 4. Game Over Screen
- "Game Over" text
- Final score and steps taken
- "Try Again" and "Quit" options

### 5. Level Complete Screen
- "Level Complete!" text
- Score for the level
- Total score
- "Next Level" and "Quit" options

### 6. Game Complete Screen
- "Congratulations!" text
- "You've completed all 13 levels!" message
- Final score
- Total steps taken
- "Play Again" and "Quit" options

## HUD Elements

### Top HUD
1. Step Counter
   - Large, centered number
   - Turns red when approaching a multiple of 13

2. Level Indicator
   - Top left corner
   - Format: "Level X/13"

3. Score
   - Top right corner
   - Format: "Score: XXXX"

### Bottom HUD
1. Monster Warning
   - Appears when 1-2 steps away from spawning a monster
   - Text: "Monster incoming!"

2. Active Bonus Indicators
   - Small icons representing active bonuses
   - Countdown timer for each active bonus

3. Level Name
   - Displays the current level's name
   - Positioned at the bottom center

## Game Grid
- White lines forming a square grid
- Cells filled with numbers indicating step count
- Player represented by a green circle
- Monsters represented by purple squares with eyes
- Goal represented by a red flag
- Obstacles represented by dark gray cells
- Bonuses represented by cyan icons

## Bonus Representations
1. Cap of Invisibility: Hat icon
2. Confused Monsters: Swirl icon
3. Land Mine: Mine icon
4. Time Bomb: Bomb icon
5. Crusher: Hammer icon
6. Builder: Brick icon

## Animations
To keep the file size small, animations will be simple and programmatic:
1. Player movement: Smooth transition between cells
2. Monster spawning: Quick fade-in effect
3. Step counter: Subtle pulse when incrementing
4. Monster warning: Flashing text
5. Bonus activation: Brief glow effect
6. Bonus deactivation: Fade-out effect

## User Interaction Points
1. Arrow keys / WASD: Player movement
2. Space / Enter: Confirm selections
3. Escape: Pause game
4. R: Quick restart (during gameplay)

## Responsive Design
- The game grid will scale to fit the available screen space
- HUD elements will reposition for mobile devices:
  - Top HUD becomes a single row on smaller screens
  - Bottom HUD moves to the side on landscape mobile orientation

## Loading and Transitions
- Use simple fade effects for transitions between screens
- Display a "Loading..." text for level generation

## Tutorial Elements
- Overlay tooltips pointing to UI elements
- Highlighted cells on the grid to guide initial movements
- Fading text boxes for instructions on new bonuses

## Level Information Display
- Brief level description or hint displayed at the start of each level
- Fades out after a few seconds or when the player makes their first move

## Accessibility Considerations
- High contrast mode option: Increases contrast between grid, player, and monsters
- Colorblind mode: Uses patterns in addition to colors to distinguish elements
- Scalable UI: Option to increase size of UI elements and grid numbers

This UI design focuses on presenting essential information clearly while maintaining a minimalist aesthetic suitable for the 13KB size constraint. The use of simple geometric shapes and a limited color palette will allow for efficient implementation and a cohesive visual style. The addition of bonus representations and level information enhances the player's understanding of the game mechanics and progression.
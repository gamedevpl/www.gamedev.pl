# Monster Steps - Game States Design Document

## Overview
This document outlines the various game states in "Monster Steps", their characteristics, and the transitions between them. The game is designed with a minimalist approach to fit within the 13KB size limit while providing an engaging user experience.

## Game States

### 1. Intro Splash Screen

#### Description
- Displays the game title "Monster Steps" prominently
- Shows a minimalist animation representing the core gameplay
- Presents options to start the game or view instructions

#### UI Elements
- Game title in large, pixelated font
- Animated 5x5 grid showing a simplified version of gameplay
- "Start Game" button
- "Instructions" button

#### Transitions
- To Gameplay State: When "Start Game" is clicked
- To Instructions State: When "Instructions" is clicked

### 2. Instructions State

#### Description
- Briefly explains the core mechanics of the game
- Highlights the importance of the number 13 and monster spawning

#### UI Elements
- Text explaining game rules
- Simple illustrations of player movement and monster spawning
- "Back" button to return to Intro Splash Screen

#### Transitions
- To Intro Splash Screen: When "Back" is clicked

### 3. Gameplay State

#### Description
- The main state where the player navigates the grid
- Displays the game grid, player, monsters, and UI elements

#### UI Elements
- Game grid with numbered cells
- Player character (green circle)
- Monsters (purple squares)
- Step counter
- Score display
- Level indicator

#### Transitions
- To Pause State: When Escape key is pressed
- To Game Over State: When player is caught by a monster
- To Level Complete State: When player reaches the goal

### 4. Pause State

#### Description
- Overlays the current game state
- Provides options to resume, restart, or quit the game

#### UI Elements
- Semi-transparent dark overlay on the game grid
- "Paused" text
- "Resume" button
- "Restart" button
- "Quit" button

#### Transitions
- To Gameplay State: When "Resume" is clicked or Escape is pressed again
- To Gameplay State (reset): When "Restart" is clicked
- To Intro Splash Screen: When "Quit" is clicked

### 5. Game Over State

#### Description
- Displays when the player is caught by a monster
- Shows the final score and steps taken

#### UI Elements
- "Game Over" text
- Final score
- Steps taken
- "Try Again" button
- "Quit" button

#### Transitions
- To Gameplay State (reset): When "Try Again" is clicked
- To Intro Splash Screen: When "Quit" is clicked

### 6. Level Complete State

#### Description
- Displays when the player reaches the goal
- Shows the level score and total score

#### UI Elements
- "Level Complete!" text
- Level score
- Total score
- "Next Level" button
- "Quit" button

#### Transitions
- To Gameplay State (next level): When "Next Level" is clicked
- To Intro Splash Screen: When "Quit" is clicked

## State Transition Triggers

1. Intro Splash Screen to Gameplay:
   - User clicks "Start Game"

2. Gameplay to Pause:
   - User presses the Escape key

3. Pause to Gameplay:
   - User clicks "Resume" or presses Escape key again

4. Gameplay to Game Over:
   - Player's position coincides with a monster's position

5. Gameplay to Level Complete:
   - Player's position coincides with the goal position

6. Game Over/Level Complete to Gameplay:
   - User chooses to play again or proceed to the next level

7. Any State to Intro Splash Screen:
   - User chooses to quit the current game

## Additional Considerations

1. Smooth Transitions:
   - Implement fade-in/fade-out effects between states for a polished feel
   - Keep transitions minimal to conserve file size

2. State Persistence:
   - Gameplay State should persist underneath the Pause State
   - Consider saving game progress to allow resuming from the last completed level

3. Responsive Design:
   - Ensure all states adapt to different screen sizes and orientations
   - Maintain readability and usability across devices

4. Performance:
   - Optimize state transitions to prevent lag, especially on lower-end devices
   - Minimize memory usage by efficiently managing active and inactive states

By clearly defining these states and their transitions, we ensure a coherent and engaging user experience while maintaining the simplicity required by the 13KB size constraint of the js13k competition.
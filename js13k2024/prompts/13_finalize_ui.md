I want to make some change to the UI of the game:

- I want the game name to be displayed on the intro screen: Monster Steps
- I want my name to by displayed at the bottom of intro screen
- Instructions to be aligned with the current gameplay, but please keep them codensed form
- When a player fails on a level, Try again should restart the same level
- Pressing arrow right should start the game
- Pressing arrow right should start next level after previous is complete
- Pressing escape should move back from instructions to intro
- Pressing escape on game over should move to intro
- Update game title in index.html
- Align game intro splash screen look and feel with intro_splash_screen.png
- It should be possible to move the player using mouse clicks (see idea described below)

How I imagine controling the player using mouse:

- on grid cells which are valid move positions render nice arrows (with some subtle animation to indicate interactivity)
- when the player clicks on the canvas, convert screen coordinates to grid coordinates, check if those are coordinates of the arrows, and if true, do game update accordingly

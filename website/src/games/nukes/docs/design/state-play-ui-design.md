# Summary

UI design for GameStatePlay

# Description

Components visible on the screen when the game is in state of play (ongoing game after player started it):

1. World canvas: displays the world, allows interactions for the player
2. Time control: player can see time of the game, can pause the game, and modify how fast it runs
3. Messages log: the player can see information about recent events
4. Full screen messages: the player is informed about most important events
5. State information: high level information about states which are participanting in the battle

Layout of the UI:

- world canvas takes full screen
- time control is displayed at the top center of the screen
- messages log is displayed on the right side
- full screen messages appear on the center of the screen
- state information is displayed on the bottom

# State information

This components contains a list of all states participating in the game.
The player state is located in the center and is highlighted
States should be closer to each other if they are friendly
State should be more distant on the list if they are hostile.

A state should be represented as a flag on the list, the flag colors can be auto generated based on the state name.

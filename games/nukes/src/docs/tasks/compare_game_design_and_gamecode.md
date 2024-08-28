# Summary

Compare game design document and game code

# Description

I want to see what features and mechanics described in game design documents are not reflected in the game code. After that I will add the missing functionality to the game. The comparison should include all game entities and gameplay mechanics mentioned in the design documents, and ensure that they are implemented in the code.

Necessary steps:

1. Read through the game design documents found in 'docs/design/game/'.
2. Understand the mechanics and features described for game entities such as States, Cities, Launch Sites, Missiles, Explosions, and Computer-Controlled States.
3. Go through the game code in the 'src/' directory to check if all those features are implemented.
4. Document the missing features or deviations from the game design in "Missing Features" section.
5. Once missing features are documented, add them to the game code.
6. Mark feature as done in the "Missing Features" section

# Missing Features

## States

- [ ] States are not differentiated by player-controlled and computer-controlled.

## Launch Sites

- [ ] Launch sites do not have a visual cooldown indicator.

## Explosions

- [ ] Explosions do not destroy launch sites

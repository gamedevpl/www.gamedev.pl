# About

Sword2sword is a sword skirmish game

## Gameplay

Player can control a character:

- movement forward/backwards/left/right
- rotation left/right
- duck
- jump
- body twist left/right
- arm controls
- hand controls

Other characters are controlled by computer (AI).

The character has some items:

- armor plate
- helmet
- shield
- sword

The point of the game is to hit other characters with a sword, so that they get hurt:

- lose hand/leg/arm (this is not fatal damge)
- lose head (fatal damage)

## Physics

The characters are 3d objects, and rules of 3d physics are applied.

## Visualisation

The gameplay is visualised on a isometric arena

# Architecture

There are a few layers of the game architecture:

- game is playable via browser, and we want to have a react web app
- game state: are we at intro screen? get ready for battle? battle screen? gameover?
- battle controls: lets the player control their character with keyboard/mouse/touch
- battle state/physics: update the game state, calculate changes, physics etc.
- sound engine: synthesise sounds according to what is happening on the screen
- rendering: render current battle state the screen

Suggested tools:

- 3d rendering: Three.js
- Physics: RapierJS
- Sound: html5 audio synthethiser

# Graphics style

I want to have pixel art style graphics for screens and the battle rendering.

The battle rendering should show damage effects and sometimes even blood.

The game should be rendered as 3d isometric view. The camera should be fixed.

The battle is happening on a limited arena, the characters cannot go through the barrier.

The barrier can be rendered as a fence. The arena can be a ground, and beyond arena there can be a grass.

# About

Sword2sword is a sword skirmish game

## Gameplay

Player can control a character:

- movement left/right

Other characters are controlled by computer (AI).

The character has some items:

- body armor
- helmet
- shield
- sword

The point of the game is to hit other characters with a sword, so that they get hurt:

- lose hand/leg/arm (this is not fatal damge)
- lose head (fatal damage)
- lose shield
- lose sword

## Physics

The characters are 2d objects, and rules of 2d physics are applied.

## Visualisation

The gameplay is visualised from the side

# Architecture

There are a few layers of the game architecture:

- game is playable via browser, and we want to have a react web app
- game component: are we at intro screen? get ready for battle? battle screen? gameover?
- game controls: lets the player control their character with keyboard/mouse/touch
- game state/physics: update the game state, calculate changes, physics etc.
- sound engine: synthesise sounds according to what is happening on the screen
- rendering: render current battle state the screen

# Graphics style

I want to have pixel art style graphics.

The game rendering should show damage effects and sometimes even blood.

The game should be rendered as 2d view from the side.

The game is happening on a limited arena, the characters cannot go through the barrier.

The barrier can be rendered as a fence. The arena can be a ground, and beyond arena there can be a grass.

# Tools

- sound engine: synthesiser using web audio api
- rendering engine: pixi.js
- physics engine: rapier2d

# Implementation architecture

Functional code style

Game loop iteration:

0. give captured user input
1. convert game state to physics state
2. apply physics
3. convert physics back to game state
4. render game state

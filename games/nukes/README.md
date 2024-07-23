# Nukes

This is a simple React application that simulates a nuclear war game.

## Getting Started

To run the game locally:

1. Install Node.js
2. Install dependencies: `npm i`
3. Run the development server: `npm run dev`

## Features
- Players can launch missiles towards various targets like cities, launch sites, or other missiles.
- The goal is to be the only state with a non-zero population.
- Multiple states can be controlled by players or AI.
- Different strategies towards other states: NEUTRAL, FRIENDLY, or HOSTILE.

## Game States
There are multiple game states defined:
- `Intro`: The introduction screen.
- `Play`: The state where players can name their state.
- `Playing`: The primary gameplay state.
- `Played`: The game over screen displaying results.
- `TechWorld`: A technical world for internal testing purposes.

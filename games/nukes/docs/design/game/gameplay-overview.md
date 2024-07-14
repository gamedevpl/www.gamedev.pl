# Gameplay Overview

Nukes is a strategic and tactical nuclear war simulation game where each player controls a fictional state. The primary objective is to become the last surviving state with a non-zero population.

## Objectives

- **Protect your Cities and Launch Sites:** Defend your cities and launch sites from enemy missile attacks.
- **Eliminate Enemy States:** Destroy enemy cities and launch sites to reduce their population to zero.

## Game Entities

### States

- Each state is controlled either by a player or computer.
- States have a unique name and possess multiple cities and launch sites.

### Cities

- Cities represent population centers.
- Each city is assigned to a specific state and contains a population.

### Launch Sites

- Launch sites are locations from which missiles are launched.
- Each launch site is assigned to a specific state.
- Launch sites have a cooldown period of 5 seconds between launches.

### Missiles

- Missiles are launched from launch sites and can target enemy cities, launch sites, or other missiles.
- Missiles travel to their targets and create explosions on impact.

### Explosions

- Explosions result from missile impacts.
- Explosions can damage cities and reduce the population
- Explosions can destroy missiles which are in range of the explosion.
- Explosions can destroy launch sites which are in range of the explosion.

## Gameplay Mechanics

### Missile Launches

- Players select a launch site and target it towards an enemy city, launch site, or missile.
- Missiles travel at a fixed speed and can take time to reach the target.

### Population Management

- Cities have populations that can be reduced by explosions.
- The game is won by the player whose state has the last remaining population.

### Computer-Controlled States

- Computer-controlled states follow a set of strategies to protect their cities and launch sites while targeting enemy assets.
- They prioritize targeting approaching enemy missiles, then enemy launch sites, and finally enemy cities.

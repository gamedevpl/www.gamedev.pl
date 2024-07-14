# Entities and Mechanics

## States
- States can be player-controlled or computer-controlled.
- Each state has a unique name.

## Cities
- Cities are assigned to states and have populations.
- Populations decrease when cities are hit by explosions.

## Launch Sites
- Launch sites are assigned to states and are used to launch missiles.
- Launch sites have a cooldown period of 5 seconds between launches.

## Missiles
- Missiles can be launched from launch sites and target enemy cities, launch sites, or other missiles.
- Missiles travel at a fixed speed and explode on impact.

## Explosions
- Explosions occur on missile impact and reduce populations of cities or destroy missiles within the explosion radius.

## Gameplay Mechanics
### Missile Launch
- Select a launch site and set a target (city, launch site, missile).
- Missiles take time to reach their targets based on distance.

### Explosions
- Explosions damage entities within the radius, including cities and missiles.

### Computer-Controlled States
- Computer states follow strategies for defense and attack.
- Priority: incoming missiles -> enemy launch sites -> enemy cities.

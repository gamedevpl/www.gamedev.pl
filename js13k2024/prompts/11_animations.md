The rendering should support following graphical effects:

- movement of monsters and the player should be animated, as a sort of jump
- when idle player and monsters should be bouncing slightly, left-right, bottom-up
- monsters to have animated tentacles
- explosions should shake the screen
- when the monster spawn is approaching there should be a small visualisation of electrical discharges on the grid, the closer we are to spawn, the more discharges. The discharge should happen after each move, animation should be like 1 sec long
- in builder mode, the new obstacles should raise from the ground
- in crusher mode, the affected obstacles should collapse down
- bomb should shake, and shake more the closer it is to explosion
- when invisible, the player should start blinking when the bonus is about to end
- when in confusing monsters mode, monsters should be shaking fast
- when player reaches the goal, before we show the next screen, lets see how the player object jumps from happiness for a moment
- when player dies, there should be vanishing animation of the player object

A suggestion how to implement some of the animations:

- some animations do not require any kind of state, it is fine to rely on Date.now()
- if you save last move timestamp, you can implement the animation of movement with combination of Date.now() usage
- destruction of obstacles could be implement by storing the destroyed ones on a separate list
- if you store creation timestamp on obstacles, you can animate the creation

When doing the implementation verify if maybe something similar is implemented, and in such case do not re-implement it, but rather leave it as is.

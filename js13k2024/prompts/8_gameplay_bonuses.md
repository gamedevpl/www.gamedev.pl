I would like to introduce a new concept to the gameplay: bonuses

Bonuses appear on the grid as objects that the player can collect. Bonuses will help the player reach the goal. Multiple bonuses can be active at the same time.

I would like to have following bonus types:
- Cap of invisibility: for the next 13 steps monsters wont't see you, but they still try to find you. The player rendering should be affect by this bonus, for example the player object could be semi transparent
- Confused monsters: for the next 13 steps monsters will move into opposite direction as they want
- Land mine: Stepping on land mine activates an explosion. The explosion elimiates everyone who is around the land mine (for player this means game over, monster will be removed from the game). Monsters are too stupid to understand land mines, they will not avoid them.
- Time bomb: stepping on time bomb actives the explosion timer (13 steps), and once it gets to 0, the bomb explodes killing everyone who is close it. Monsters do not understand time bombs, they will not avoid them. Activated time bomb should display as an object on the grid, timer should be displayed on it.
- Crusher: for the next 13 steps the player will crush obstacles and make them disappear. Player is no longer blocked by obstacles, player cen step on any obstacle and it will destroy the obstacle.
- Builder: for the next 13 steps the player will build new obstacles behind them whenever they move

Graphical effects:
- Land mine, and time bomb explosions should be rendered for 1 step. Basically highlight affected grid cells with yellow/orange color. To implement that, we probably need to have a property on game state.
- When Cap of invisibility, Crusher, or Builder is active, render a tooltip above player object, include bonus duration info.
- When Confused monsters are active, render a tooltip above monster objects, include bonus duration info

Please analyze the existing implementation and make sure all of the above is implemented.
# Game Idea 1: Monster Steps

**Theme:** Triskaidekaphobia

**Overview:**
In "Monster Steps," the player's goal is to navigate a pedestrian from point A to point B on a grid-like map. The challenge arises from the phobia of the number 13: every 13th step summons a monster that chases the player. The player must strategically plan their moves to avoid being caught by the monster.

**Game States:**

1. **Intro Splash Screen:**
   - Display the game title "Monster Steps"
   - Brief instructions on how to play the game:
     - Use arrow keys to move
     - Reach the destination while avoiding monsters
     - Monsters appear every 13th step
   - Option to start the game

2. **Gameplay State:**
   - Display a grid map with the player and destination marked
   - Increment steps as the player moves
   - Summon a monster every 13th step
   - Monster's movement mimics player's previous path
   - Objective: Reach the destination without getting caught

3. **Pause State:**
   - Option to resume or restart the game
   - Display current step count

4. **Game Over State:**
   - Occurs when a monster catches the player or the player reaches the destination
   - Display outcome: "Caught!" or "You Win!"
   - Show the number of steps taken
   - Option to play again

**Graphics and Implementation:**
- Simple 2D top-down view
- Lightweight graphics to ensure the game fits within 13KB
- Implemented using HTML5 canvas for rendering

**Additional Notes:**
- The game mechanics and graphics are designed to be straightforward to maintain the small size constraint.
- Consider adding sound effects for monster appearances and game events to enhance engagement.
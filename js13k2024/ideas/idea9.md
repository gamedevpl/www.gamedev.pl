# Game Idea 9: 13th Jungle Run

**Theme:** Triskaidekaphobia

**Overview:**
In "13th Jungle Run," players race through a dense jungle path while avoiding obstacles and collecting treasures. The twist is that every 13th obstacle introduces a new hazard, increasing the difficulty and requiring quick reflexes.

**Game States:**

1. **Intro Splash Screen:**
   - Display the game title "13th Jungle Run"
   - Brief instructions:
     - Navigate through the jungle by dodging obstacles
     - Collect treasures to increase your score
     - Every 13th obstacle brings a new challenge
   - Option to start the game

2. **Gameplay State:**
   - Display a scrolling 2D jungle path
   - Use arrow keys to jump over or dodge obstacles
   - Collect treasures to boost score
   - Objective: Travel as far as possible while avoiding obstacles

3. **Pause State:**
   - Options to resume or restart
   - Display current score and distance traveled

4. **Game Over State:**
   - Triggered by collision with an obstacle
   - Display result: "Tripped in the Jungle!" or "Great Run!"
   - Show distance covered and treasures collected
   - Option to retry

**Graphics and Implementation:**
- Simple 2D graphics of jungle scenery and dynamic obstacles
- Designed to be lightweight for the 13KB competition constraint
- Utilizes HTML5 canvas for fluid movement and interactions

**Additional Notes:**
- Focuses on quick reflexes and timing.
- Consider adding jungle-themed sound effects and music to enhance the atmosphere.
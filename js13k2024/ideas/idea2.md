# Game Idea 2: 13-Alarm Puzzle

**Theme:** Triskaidekaphobia

**Overview:**
In "13-Alarm Puzzle," players face a labyrinth filled with traps and obstacles. The objective is to reach the exit without triggering 13 alarms. Each step on the path has a chance to set off an alarm, requiring careful planning and strategy.

**Game States:**

1. **Intro Splash Screen:**
   - Display the game title "13-Alarm Puzzle"
   - Brief instructions on how to play:
     - Navigate through the labyrinth to find the exit
     - Avoid triggering alarms
     - If 13 alarms are triggered, the game ends
   - Option to start the game

2. **Gameplay State:**
   - Show a top-down view of the labyrinth
   - Players can use arrow keys to move
   - Display the number of alarms triggered
   - Highlight potential trap tiles
   - Objective: Reach the exit with fewer than 13 alarms

3. **Pause State:**
   - Provide options to resume or restart the game
   - Show current progress and alarms triggered

4. **Game Over State:**
   - Triggered when 13 alarms are reached or the exit is found
   - Display result: "Trapped!" if alarms reach 13 or "Escaped!" if successful
   - Show the number of alarms triggered
   - Option to try again

**Graphics and Implementation:**
- Simple 2D labyrinth design
- Minimalistic graphics to fit the 13KB limit
- HTML5 canvas for game rendering

**Additional Notes:**
- The game emphasizes strategic movement and decision-making.
- Consider adding a timer to increase difficulty and engagement.
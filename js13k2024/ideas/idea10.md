# Game Idea 10: Puzzle of 13

**Theme:** Triskaidekaphobia

**Overview:**
In "Puzzle of 13," players are challenged to solve a series of number-based puzzles where the number 13 must be avoided when summing tiles in a grid. The objective is to clear the board without forming any lines that sum to 13.

**Game States:**

1. **Intro Splash Screen:**
   - Display the game title "Puzzle of 13"
   - Brief instructions:
     - Arrange tiles to form horizontal or vertical lines
     - Ensure no line sums to 13
   - Option to start the game

2. **Gameplay State:**
   - Display a grid filled with numbered tiles
   - Drag and drop tiles to create lines
   - Objective: Clear the board by forming valid lines

3. **Pause State:**
   - Options to resume or restart
   - Show current board state and moves made

4. **Game Over State:**
   - Triggered when no more moves can be made without summing to 13
   - Display result: "Unlucky Sum!" or "Perfect Game!"
   - Show number of moves made and lines cleared
   - Option to retry

**Graphics and Implementation:**
- Simple 2D visuals focused on numbers and grid layouts
- Lightweight to ensure the game fits within the 13KB limit
- HTML5 canvas for dynamic tile interactions

**Additional Notes:**
- Emphasizes careful strategy and planning.
- Consider adding background sound effects that highlight successful moves or warnings.
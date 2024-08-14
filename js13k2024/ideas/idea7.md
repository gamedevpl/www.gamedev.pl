# Game Idea 7: Thirteen Tiles

**Theme:** Triskaidekaphobia

**Overview:**
In "Thirteen Tiles," players must match tiles with numbers and symbols to clear the board. The challenge is to strategically eliminate tiles without leaving 13 unmatchable tiles.

**Game States:**

1. **Intro Splash Screen:**
   - Display the game title "Thirteen Tiles"
   - Brief instructions:
     - Match tiles based on numbers and symbols
     - Clear the board without leaving 13 tiles unmatchable
   - Option to start the game

2. **Gameplay State:**
   - Display a grid of tiles with different numbers and symbols
   - Players click tiles to match and clear them from the board
   - Objective: Avoid leaving 13 unmatched tiles

3. **Pause State:**
   - Allow players to pause the game
   - Display current progress and remaining tiles
   - Options to resume or restart

4. **Game Over State:**
   - Occurs when no more matches can be made and 13 tiles remain
   - Display result: "Out of Moves!" or "Board Cleared!"
   - Show total tiles matched
   - Option to try again

**Graphics and Implementation:**
- Simple and colorful 2D tile graphics
- Designed to fit within the 13KB size constraint
- HTML5 canvas for seamless tile interactions

**Additional Notes:**
- Focuses on strategic matching and tile management.
- Consider adding sound effects for successful matches and game over scenarios.
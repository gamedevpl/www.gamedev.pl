# Game Idea 11: 13th Night

**Theme:** Triskaidekaphobia

**Overview:**
In "13th Night," players take on the role of a night watchman guarding a village against supernatural threats. The aim is to survive 13 nights while protecting the village from spirits that grow stronger each night.

**Game States:**

1. **Intro Splash Screen:**
   - Display the game title "13th Night"
   - Brief instructions:
     - Use light sources to ward off spirits
     - Manage energy and resources to survive 13 nights
   - Option to start the game

2. **Gameplay State:**
   - Display a 2D village map with light sources
   - Players click to activate or relocate lights
   - Spirits appear and move towards the village center
   - Objective: Survive the night by keeping spirits at bay

3. **Pause State:**
   - Options to pause and review strategies
   - Display current night progress and resources
   - Resume or restart

4. **Game Over State:**
   - Triggered when spirits overrun the village or all nights are survived
   - Display result: "Village Overrun!" or "Victory!"
   - Show nights survived and final score
   - Option to play again

**Graphics and Implementation:**
- Basic 2D graphics with emphasis on lighting effects
- Lightweight to fit within the 13KB limit
- HTML5 canvas for smooth interactions and light animations

**Additional Notes:**
- Focuses on resource management and strategic planning.
- Consider adding ambient soundscapes and effects to create a tense atmosphere.
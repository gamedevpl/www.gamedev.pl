# Game Design Document: Tribe (MVP)

## 1. Game Overview (MVP)

- **Concept Statement:** You control a single character. Your primary goal is to ensure your lineage survives by procreating. Once your current character dies (from hunger or old age), you gain control over your oldest living descendant. The game ends if, upon the current character's death, no living offspring exists (Lineage Extinct).
- **Core Gameplay Loop (MVP):**
  1.  Manage the current character's hunger by finding and consuming food. Hunger increases at a fixed rate (e.g., per game hour);
  2.  Procreate with a partner to produce offspring. Procreation is always successful in the MVP if conditions (e.g., not critically hungry, cooldown met) are met.
  3.  Witness time pass at a fixed rate, characters age, and children grow.
  4.  Upon character death, seamlessly transition control to the next generation (oldest offspring). There is no grace period if the offspring is in a critical state.
- **Player Goal (MVP):** Keep your lineage alive for as many generations as possible. Success is measured by a simple counter for the number of generations that persist, displayed in the UI.

## 2. Core Mechanics (MVP)

- **Movement & Spatial Interaction:**
  - **Movement System:** Characters move freely in 2D space using continuous positioning (not grid-based). Movement is smooth and immediate in response to player input.
  - **Base Speed:** All characters have a standard movement speed of 100 pixels per second.
  - **Speed Modifiers:** When hunger exceeds 80/100, movement speed is reduced to 50% of base speed (50 pixels per second).
  - **World Wrapping:** The game world behaves like a sphere. When characters move off one edge of the map (800x600 pixel area), they seamlessly reappear on the opposite side. Moving off the right edge brings them back on the left, moving off the top brings them back at the bottom, and vice versa.
  - **Interaction Range:** Characters must be within 30 pixels of an object or another character to interact with them (gather berries, initiate procreation).
  - **Collision:** Characters cannot occupy the same space. Simple collision detection prevents overlapping, with characters sliding around each other when paths intersect.
  - **Pathfinding:** Direct movement toward target locations. No complex pathfinding required due to simple environment with no obstacles beyond other characters.

- **Survival (Hunger Focus):**
  - **Attribute:** Characters possess a 'hunger' level (0-100).
  - **Progression:** Hunger increases automatically over time (e.g., +5 per game hour). If hunger reaches 80/100, movement speed is reduced. If hunger is above 95/100, procreation is not possible.
  - **Satisfaction:** Consuming 'berries' (the basic food item) reduces hunger (e.g., 1 berry = -25 hunger).
  - **Consequence:** If hunger reaches 100, the character dies.

- **Procreation & Offspring (Basic):**
  - **Initiation:** The player character (initially male) can interact with an initial female character to attempt procreation. A cooldown period (e.g., 1 game day) applies to both characters after a procreation event.
  - **Gestation:** After a successful procreation attempt, a 'gestation' period begins (e.g., 3 game days).
  - **Birth:** An offspring (child) is born after the gestation period.
  - **Parentage:** Offspring are linked to their parents.
  - **Aging:** Children age over time, eventually becoming adults after a set duration (e.g., 5 game years).
  - **Needs (Simplified):** Children also have hunger needs. Parents' berry inventory is automatically shared if available (1 berry consumed by child reduces child's hunger and parent's inventory). If parents have no berries, the child's hunger increases at a faster rate than an adult's. Direct management of children's needs by the player is deferred.

- **Generational Transfer:**
  - **Trigger:** Occurs when the currently controlled player character dies (due to hunger or reaching a maximum age).
  - **Mechanism:** Control automatically transfers to the character's oldest living offspring. If multiple offspring were created at the exact same internal timestamp, the first one created in the game's internal list is chosen. If no living offspring exist, the game ends with a "Lineage Extinct" message.

- **Resource Gathering (Simplified):**
  - **Resource:** A single food resource: 'Berries'. Player inventory limit is 10 berries.
  - **Source:** Berries can be collected from static 'Berry Bush' locations on the map. Each bush is finite (e.g., holds a maximum of 5 berries).
  - **Collection:** Player interacts with a Berry Bush to gather 1 berry at a time, added to their inventory, if the bush has berries and player inventory is not full.
  - **Regeneration:** Berry Bushes regenerate berries (e.g., 1 berry per game day, up to its maximum of 5). If all bushes are empty and none are regenerating, the player must wait or manage existing resources carefully.

- **Time Progression & Aging:**
  - **Clock:** A simple game clock tracks passing days/years. 1 game day = 10 real seconds.
  - **Aging:** Characters (player, partner, offspring) age as game time progresses.
  - **Old Age Death:** Characters have a maximum lifespan (e.g., 60 game years) and will die of old age if they survive hunger. If a character reaches maximum age and has no living offspring, it results in a game over upon their death.

- **Character Representation (Basic):**
  - **Entities:** Player character, initial partner, and their offspring.
  - **Visuals:** Simple visual differentiation (e.g., different sprites or colors for male/female, adult/child). No additional visual cues for hunger beyond the UI display in MVP.
  - **Movement:** Basic 2D movement on the map. Speed is constant unless affected by high hunger (above 80).

## 3. World & Environment (MVP)

- **Map:** A small, static 2D area (e.g., 800x600 pixels) that wraps around like a sphere - characters moving off one edge reappear on the opposite side.
- **Key Locations / Objects:**
  - **Bonfire (Visual Only):** A central point, purely for visual reference. No interaction or gameplay effect.
  - **Berry Bushes:** 3 designated spots on the map where berries can be gathered. Their positions are fixed and defined at game start.
- **Hazards:** None, beyond starvation and old age. No aggressive animals, environmental threats, or other tribes in the MVP.

## 4. User Interface (UI) & Controls (MVP - Basic)

- **Displays (Located top-left corner of the screen):**
  - Current character's hunger level (numerical display: 0-100).
  - Number of 'berries' in inventory (numerical display: 0-10).
  - Current character's age (numerical display: years).
  - Current generation number (numerical display, e.g., "Generation: 1").
- **Controls:**
  - Movement: WASD keys.
  - Interact: 'E' key. Context-sensitive: gathers a berry if next to a bush with berries and inventory not full; initiates procreation if next to a valid partner and conditions are met.
  - Eat: 'F' key (consumes 1 berry from inventory if available).
- **Notifications:**
  - Alert for character death.
  - Notification of transfer to the next generation.
  - Game Over screen if the lineage ends.
  - Notifications persist for 5 real seconds or until a key is pressed.
  - Game Over screen displays: "Game Over! Lineage Extinct. Generations Survived: X. Cause of Death: [Hunger/Old Age]."

## 5. Initial State (MVP)

- The game starts with one adult male player character and one adult female non-player character (NPC) partner, both located near the central bonfire.
  - Player (Male): Age 20 years, Hunger 50/100, 0 Berries in inventory.
  - Partner (Female): Age 20 years, Hunger 50/100.
- Three Berry Bushes are present on the map at predefined locations (e.g., map edges). Each bush starts with 3 berries.
- A visual bonfire is present at a central map location.

## 6. Deferred Features (For Future Iterations)

This list outlines features from the full GDD that are intentionally excluded from the MVP to maintain focus:

- Complex AI for tribe members and other tribes (beyond the initial partner's basic existence).
- Combat system (no hunting, no hostile encounters).
- Advanced resource gathering (wood, stone, etc.) and crafting (tools, shelters).
- Reputation system or complex social interactions.
- Detailed skills, abilities, and a technology tree.
- The overarching goal of 'world dominance'.
- Multiple biomes, dynamic environmental changes, complex environmental hazards (weather, disease).
- Auto-run mode, multi-year time jumps.
- Detailed character customization, wider range of character attributes beyond hunger and age.
- Tribe management beyond the direct lineage.
- Sound and advanced visual effects.
# Game Design Document: Tribe (MVP) Hills

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

  - **Initiation:** A male and female human can attempt procreation if both are adults (e.g., age >= 16), not critically hungry (hunger < 95), and not currently on procreation cooldown. Procreation is initiated via interaction (e.g., 'E' key for player, AI decision for NPC).
  - **Food Availability Check for AI:** AI-controlled characters will only attempt procreation if they detect a sufficient number of food sources (e.g., at least 2 berry bushes) within a certain radius (e.g., 200 pixels) around them. This ensures that procreation is more likely to occur in resource-rich areas, contributing to the sustainability of the tribe.
  - **Gestation:** Upon successful procreation, the female enters a 'pregnant' state. A gestation period begins (e.g., 3 game days/72 game hours). During gestation, the female's hunger increases at a slightly faster rate.
  - **Birth:** After the gestation period, a new child (human entity) is born at the mother's position. The child's gender is randomly determined. Both parents (if alive) are linked to the child. The mother and father (if applicable) enter a procreation cooldown.
  - **Procreation Cooldown:** After a successful procreation (or birth), both the male and female involved enter a cooldown period (e.g., 1 game day/24 game hours) during which they cannot initiate or be involved in another procreation attempt.
  - **Parentage:** All offspring are linked to their biological mother and father.
  - **Aging & Child Development:** Children are born with 0 age. They age over time. At a certain age (e.g., 16 game years), they become adults, capable of independent actions, including procreation.
  - **Child Needs (Simplified):** Children have hunger needs. Their hunger increases at a faster rate than adults. If a child is hungry and its parents (if alive and nearby) have berries, one berry is automatically consumed from the parent's inventory to feed the child. If no berries are available from parents, the child's hunger continues to increase, potentially leading to death. Direct player management of children's needs is deferred.

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

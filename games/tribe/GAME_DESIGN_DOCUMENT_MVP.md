# Game Design Document: Tribe

## 1. Game Overview

- **Concept Statement:** You control a human character in a dynamic tribal world. Your primary goal is to ensure your lineage survives and your tribe thrives through multiple generations. The game features complex survival mechanics, tribal politics, diplomacy, combat, and strategic resource management in a persistent world populated by AI-controlled tribes.

- **Core Gameplay Systems:**
  1. **Survival Management**: Monitor hunger and health, gather food, manage resources
  2. **Tribe Leadership**: Lead your tribe, make strategic decisions, manage diplomacy with other tribes
  3. **Combat & Warfare**: Engage in tactical combat, coordinate attacks, defend territory
  4. **Family & Lineage**: Procreate, raise children, establish family territories, manage inheritance
  5. **Resource Economics**: Gather berries, plant bushes, claim territory, optimize resource distribution
  6. **AI Autopilot**: Enable automated behaviors for gathering, combat, procreation, and other activities

- **Player Goals:**
  - **Short-term**: Survive, feed your family, establish territory, grow your tribe
  - **Long-term**: Lead your tribe to dominance, expand territory through migration or conquest, maintain diplomatic relationships, achieve multi-generational prosperity
  - **Victory Conditions**: Keep your lineage alive through generations while building a thriving, dominant tribe

## 2. Core Mechanics

### 2.1 Movement & Spatial Interaction

- **Movement System:** Characters move freely in a large 2D world (3000x3000 pixels) using continuous positioning. Movement is smooth and responds to both player input and AI decisions.
- **Base Speed:** Characters have a base movement speed of 10 pixels per second (implemented as `HUMAN_BASE_SPEED`).
- **Speed Modifiers:** 
  - When hunger exceeds 80% of death threshold (120/150), movement speed is reduced by 50%
  - When characters reach old age (80% of max age = 64 years), movement speed is reduced to 70% of current speed
  - Combat damage can apply temporary movement slowdowns
  - All speed modifiers stack multiplicatively
- **World Navigation:** The game world wraps around like a sphere - characters moving off one edge reappear on the opposite side.
- **Interaction Range:** Characters can interact with objects and other characters within 30 pixels (`HUMAN_INTERACTION_RANGE`).
- **Collision:** Characters cannot occupy the same space and will slide around each other when paths intersect.
- **Pathfinding:** Direct movement toward targets with sophisticated AI behavior trees managing complex decision-making.

### 2.2 Health & Survival System

- **Dual Health System:**
  - **Hunger**: Ranges from 0-150, increases at 5 points per game hour. Death occurs at 150.
  - **Hitpoints**: Separate health pool that can be damaged through combat, healing over time.
  
- **Hunger Effects:**
  - 30+ hunger: Mild hunger, tutorial notifications trigger
  - 120+ hunger: Speed reduction to 50%, prevents procreation at 142+
  - 127+ hunger: Critical hunger, enables desperate behaviors
  - 150 hunger: Death from starvation

- **Food System:**
  - Characters can carry up to 10 food items (`HUMAN_MAX_FOOD`)
  - Eating 1 berry reduces hunger by 30 points
  - Berries must be gathered from berry bushes or obtained from other characters

### 2.3 Combat System

- **Combat Mechanics:**
  - **Attack Range:** 50 pixels (`HUMAN_ATTACK_RANGE`)
  - **Attack Cooldown:** 2 game hours between attacks
  - **Attack Buildup:** 0.1 hours preparation time before damage is dealt
  - **Damage System:** Base damage with modifiers for gender, age, and vulnerability
  - **Parry System:** Chance to block attacks based on positioning and timing

- **Damage Modifiers:**
  - Male characters deal more damage (`HUMAN_MALE_DAMAGE_MODIFIER`)
  - Child characters deal reduced damage (`HUMAN_CHILD_DAMAGE_MODIFIER`) 
  - Vulnerable targets (low health) take increased damage
  - Old age affects combat effectiveness

- **Combat Effects:**
  - Successful attacks push back the target and apply movement slowdown
  - Visual and audio effects accompany all combat actions
  - Death results in corpse entities that persist in the world

### 2.4 Advanced AI Behavior System

- **Behavior Trees:** All AI-controlled characters use sophisticated behavior trees with 20+ different behaviors:
  - **Survival**: Eating, gathering, fleeing from danger
  - **Social**: Procreation, feeding children, following leaders
  - **Combat**: Attacking, defending family/territory, calling for help
  - **Strategic**: Territory establishment, resource planning, diplomacy
  - **Tribe Management**: Migration, splitting, leadership decisions

- **Priority System:** Behaviors are prioritized with survival and defense taking precedence over social and strategic actions.

- **Blackboard System:** AI uses shared memory for complex decision-making and coordination between tribe members.

### 2.5 Tribe System

- **Tribe Structure:**
  - Each tribe has a leader (`leaderId`) who makes strategic decisions
  - All tribe members share the same `leaderId` to identify their tribe membership
  - Tribes are identified by unique visual badges (`tribeBadge`)

- **Leadership:**
  - Leaders make high-level strategic decisions every 10 game hours
  - Leaders can call tribe members to attack or follow
  - Leadership succession occurs when leaders die (eldest child inherits)

- **Tribe Behaviors:**
  - **Splitting**: Large tribes (40+ members) can split when families grow large enough
  - **Migration**: Leaders can relocate entire tribes to better territories
  - **Combat Coordination**: Tribes coordinate attacks and defense through leader commands

### 2.6 Diplomacy System

- **Diplomacy States:**
  - **Friendly**: Tribes cooperate, share resources, avoid conflict
  - **Hostile**: Tribes compete aggressively, engage in combat

- **Diplomatic Decisions:** Tribe leaders periodically reassess relationships based on:
  - Territory proximity and resource competition
  - Historical conflicts and cooperation
  - Relative tribe strength and strategic advantage

### 2.7 Territory & Resource Management

- **Berry Bush System:**
  - Bushes contain 0-5 berries, regenerating 1 berry every 12 game hours
  - Bushes have lifespans (940 hours) and can spread to nearby locations
  - Characters can plant new bushes using carried berries

- **Territory Claiming:**
  - Characters can claim berry bushes for 240 game hours
  - Claimed bushes are defended by the family/tribe
  - Visual indicators show ownership status

- **Resource Analysis:** Leaders periodically analyze territory quality based on:
  - Berry bush density and productivity
  - Threat levels from hostile tribes
  - Strategic positioning for defense and expansion

### 2.8 Procreation & Family Systems

- **Procreation Requirements:**
  - Both partners must be adults (age 16+, females max age 40)
  - Neither can be critically hungry (hunger < 142/150)
  - Neither can be on procreation cooldown (24 game hours)
  - Must be within interaction range (30 pixels)

- **AI Procreation Logic:**
  - AI checks for sufficient food sources (2+ berry bushes within 400 pixels)
  - Lineage size limits prevent overpopulation (max 3 children per AI)
  - AI seeks unrelated partners for genetic diversity
  - Avoids procreation if partner's primary mate is nearby

- **Pregnancy & Birth:**
  - Gestation period: 24 game hours (reduced from original 72)
  - Pregnant females have 25% increased hunger rate
  - Birth creates new child at mother's location
  - Both parents enter 24-hour procreation cooldown

- **Child Development:**
  - Children become adults at age 16
  - Children have faster hunger increase than adults
  - Children actively seek food from parents when hungry
  - Parents automatically feed hungry children within range

- **Family Relationships:**
  - Complex family trees track fathers, mothers, partners, and ancestors
  - Family territories can be established by adult males with families
  - Adult children will feed elderly parents (age 60+, hunger 80+)
  - Inheritance system transfers leadership to eldest child

### 2.9 Generational Transfer

- **Death Triggers:** Character death from hunger (150), old age (80 years), or combat (0 hitpoints)
- **Succession System:** 
  - Control transfers to oldest living offspring
  - If no offspring exist, game ends with "Lineage Extinct"
  - Leadership roles transfer through inheritance
- **Continuity:** World continues with all other characters, tribes, and systems intact

### 2.10 Resource Management

- **Berry Collection:**
  - Primary food source gathered from berry bushes
  - Each bush holds 0-5 berries, starting with 3 berries
  - Bushes regenerate 1 berry every 12 game hours
  - Gathering has a brief cooldown to prevent spam-clicking

- **Meat Recovery from Corpses:**
  - When characters die, they leave corpses that contain meat (10 food items initially)
  - Corpses can be harvested by other characters for emergency food supplies
  - Corpses decay over time (128 game hours), losing their food value
  - Provides alternative food source during resource scarcity
  - Same gathering mechanics as berry bushes (interaction range, cooldown)

- **Berry Bush Planting:**
  - Players and AI can plant new bushes using carried berries
  - Planted bushes start with lower berry counts but grow over time
  - Strategic planting expands available food sources

- **Inventory Management:**
  - Characters can carry up to 10 berries
  - Food is automatically consumed when eating (reduces hunger by 30)
  - Visual indicators show food levels in UI

- **Resource Competition:**
  - Multiple characters can gather from the same bush
  - Claimed bushes create territorial disputes
  - Resource scarcity drives tribal conflicts

### 2.11 Time & Aging System

- **Time Scale:**
  - 1 game day = 10 real seconds (24 game hours)
  - 1 game year = 4 real minutes approximately
  - Time controls allow pausing and fast-forwarding

- **Character Aging:**
  - Characters age continuously as game time passes
  - Maximum lifespan: 80 game years
  - Age affects movement speed, combat ability, and procreation eligibility
  - Death from old age triggers succession mechanics

## 3. World & Environment

### 3.1 World Structure

- **Map Size:** Large 3000x3000 pixel world (expanded from 800x600 MVP)
- **World Topology:** Spherical wrapping - characters moving off edges reappear on opposite sides
- **Dynamic Ecosystem:** 
  - Initially spawns 45 berry bushes across the world
  - Bushes can spread naturally with 70% chance every 90 hours
  - Bush lifespans create natural resource cycles

### 3.2 Environmental Elements

- **Berry Bushes:** Primary food source scattered throughout the world
- **Visual Landmarks:** Bonfire and other environmental features for navigation
- **Territory Markers:** Visual indicators show claimed areas and tribal boundaries
- **Dynamic Population:** Multiple AI tribes populate the world simultaneously

### 3.3 World Dynamics

- **Ecosystem Balance:** Bush regeneration and spreading maintain food supply
- **Population Cycles:** Tribes grow, split, migrate, and compete for resources
- **Environmental Pressure:** Resource scarcity drives migration and conflict
- **Persistent World:** All actions have lasting consequences on the world state

## 4. User Interface & Controls

### 4.1 Status Display System

- **Core Status Indicators (Top-left):**
  - **Time**: Current game day/year with calendar icon
  - **Hunger**: Visual bar and numerical value (0-150) with meat icon
  - **Hitpoints**: Health bar with numerical value and heart icon  
  - **Food Inventory**: Berry count (0-10) with berry icon
  - **Autopilot Status**: Shows active AI behaviors with robot icon
  - **Mute Status**: Audio control indicator

- **Family Information Panel:**
  - Current character's age and generation number
  - Family relationships and lineage tree
  - Partner and children information

### 4.2 Tribe Management Interface

- **Tribe List Panel:**
  - All tribes in the world with member counts
  - Tribe badges and leader information
  - Diplomacy status indicators (Friendly/Hostile)
  - Distance and relationship data

- **Diplomatic Interface:**
  - Current relationships with other tribes
  - Options to change diplomatic stance
  - Threat assessment and strategic information

### 4.3 Control Systems

- **Basic Controls:**
  - **Movement**: WASD keys for character movement
  - **Interact**: E key for context-sensitive interactions
  - **Eat**: F key to consume food from inventory
  - **Pause**: Spacebar to pause/unpause game time

- **Advanced Player Actions:**
  - **Gather**: Collect berries from bushes (✋)
  - **Procreate**: Initiate reproduction with partners (❤️)
  - **Attack**: Engage in combat with enemies (⚔️)
  - **Plant**: Place new berry bushes (🌱)
  - **Call to Attack**: Rally tribe members for combat (📢)
  - **Split Tribe**: Create new tribe from current one (🔱)
  - **Follow Me**: Command tribe members to follow (➡️)
  - **Feed Child**: Give food to offspring (👨‍👧)

### 4.4 Autopilot AI System

- **Automated Behaviors (Toggle On/Off):**
  - **Gathering**: Automatically collect food sources
  - **Procreation**: Seek partners and reproduce
  - **Planting**: Place berry bushes strategically
  - **Attack**: Engage enemies and defend territory
  - **Feed Children**: Care for offspring automatically
  - **Follow Leader**: Maintain tribal cohesion

- **Autopilot Interface:**
  - Individual behavior toggles with visual indicators
  - Active action highlights and status displays
  - Override controls for manual intervention

### 4.5 Notification System

- **Notification Types:**
  - **Hello**: Welcome and tutorial messages
  - **New Tribe Formed**: Tribal splitting announcements
  - **No Heir**: Warnings about lineage extinction risk
  - **Children Starving**: Family emergency alerts

- **Notification Features:**
  - Persistent display with dismiss options
  - Clickable notifications to jump to relevant locations
  - Visual highlights for important game events
  - Timed auto-dismiss for less critical messages

### 4.6 Visual Feedback Systems

- **Character Highlighting:**
  - **Player Character**: Green highlight
  - **Family Members**: Color-coded by relationship
  - **Partners**: Purple highlighting
  - **Children**: Blue highlighting
  - **Heirs**: Gold/amber highlighting

- **Territory Visualization:**
  - Claimed berry bushes show ownership colors
  - Family territory boundaries when established
  - Tribal territory and influence zones

- **Action Indicators:**
  - Visual hints for available actions
  - Range indicators for attacks and interactions
  - Progress bars for ongoing activities

### 4.7 Audio System

- **Sound Effects:**
  - Combat sounds (attacks, parrying, death)
  - Eating and gathering audio feedback
  - Birth and procreation sounds
  - UI interaction sounds (button clicks)

- **Music System:**
  - Ambient soundtrack with volume controls
  - Dynamic audio that responds to game events
  - Master volume and mute controls

## 5. Initial Game State

### 5.1 Starting Conditions

- **Player Character**: Adult male, age 20, hunger 50/150, full hitpoints, 0 berries
- **Starting Partner**: Adult female NPC, age 20, hunger 50/150, basic AI behaviors
- **World Population**: Multiple AI tribes already established with varying sizes and territories
- **Berry Bushes**: 45 bushes distributed across the 3000x3000 world, each with 3 initial berries
- **Environmental Features**: Central bonfire and other landmark features for navigation

### 5.2 Initial AI Behavior

- **Partner AI**: Basic survival and social behaviors, will procreate and gather food
- **Other Tribes**: Fully autonomous tribes with leaders, diplomacy, and strategic AI
- **World Dynamics**: Berry bush spreading, tribal interactions, and resource competition already active

## 6. Advanced Systems (Beyond MVP)

### 6.1 Strategic AI Systems

- **Leader Meta-Strategy**: Tribe leaders periodically (every 10 hours) assess:
  - Territory quality and resource availability
  - Threat levels from other tribes
  - Migration opportunities for better habitats
  - Diplomatic opportunities and risks

- **World Analysis Grid**: Leaders analyze the world in 500x500 pixel cells to:
  - Evaluate habitat quality (bush density, safety)
  - Identify optimal territories for migration
  - Assess strategic positions for defense

- **Combat Strategy**: Leaders coordinate tribal warfare through:
  - Strength assessments before engaging enemies
  - Tactical positioning and group combat
  - Defensive positioning around claimed resources

### 6.2 Complex Social Behaviors

- **Jealousy System**: Characters may attack when witnessing partners with others
- **Family Defense**: Automatic defense of family members under attack
- **Territorial Defense**: Protection of claimed berry bushes from intruders
- **Succession Planning**: Strategic considerations for heir development

- **Social Hierarchies**:
  - Patriarchal family structures with male leaders
  - Children following father figures for protection
  - Adult children establishing independent territories

### 6.3 Advanced Diplomatic System

- **Dynamic Relations**: Diplomatic status changes based on:
  - Resource competition and territorial disputes
  - Historical conflicts and cooperation
  - Tribal strength ratios and strategic advantages

- **Diplomatic Actions**:
  - Peace negotiations and alliance formations
  - Declarations of war and hostility
  - Resource sharing agreements
  - Territorial boundary negotiations

### 6.4 Territory Management

- **Family Territories**: Adult males with families can establish territories:
  - Defined boundary areas with preferred resources
  - Defense of territory from outside intrusion
  - Strategic positioning away from extended family

- **Tribal Territories**: Large-scale territorial control by entire tribes:
  - Migration to superior territories when identified
  - Expansion through peaceful settlement or conquest
  - Resource optimization within controlled areas

### 6.5 Economic Systems

- **Resource Planning**: Strategic food distribution and storage:
  - Bush planting for long-term sustainability
  - Optimal gathering patterns and efficiency
  - Emergency resource allocation during scarcity

- **Labor Specialization**: Different tribe members focus on:
  - Gathering specialists for resource collection
  - Warriors for defense and expansion
  - Planters for ecosystem development
  - Leaders for strategic decision-making

### 6.6 Tribal Lifecycle Management

- **Tribe Formation**: New tribes form through:
  - Splitting from parent tribes when population grows large
  - Exile or voluntary departure of family groups
  - Merger of small struggling groups

- **Tribe Evolution**: Tribes adapt and change through:
  - Leadership succession and changing strategies
  - Adaptation to environmental pressures
  - Cultural evolution through generations

## 7. Technical Implementation

### 7.1 AI Architecture

- **Behavior Trees**: Hierarchical decision-making system with:
  - Priority-based behavior selection
  - Timeout mechanisms to prevent AI getting stuck
  - Caching for expensive calculations
  - Modular behavior composition

- **Blackboard System**: Shared memory for:
  - Inter-character communication
  - Strategic information storage
  - Coordination of group actions
  - Historical decision tracking

### 7.2 Performance Optimization

- **Spatial Optimization**: Efficient handling of large world with many entities
- **AI Optimization**: Behavior tree caching and timeout systems
- **Rendering Optimization**: Viewport-based rendering for large world
- **Memory Management**: Efficient entity and interaction systems

## 8. Feature Implementation Status

### 8.1 Fully Implemented Features

**Core Systems:**
- ✅ Movement and spatial interaction with world wrapping
- ✅ Dual health system (hunger + hitpoints)
- ✅ Complete combat system with damage, parrying, and effects
- ✅ Advanced procreation and family relationship systems
- ✅ Generational transfer and inheritance
- ✅ Resource gathering and berry bush management
- ✅ Time progression and aging with realistic lifespans

**Advanced Systems:**
- ✅ Sophisticated AI behavior trees with 20+ behaviors
- ✅ Tribe system with leaders, badges, and management
- ✅ Diplomacy system with dynamic relationship changes
- ✅ Territory establishment and resource claiming
- ✅ Bush planting and ecosystem management
- ✅ Strategic AI for leaders with world analysis
- ✅ Tribe splitting and migration systems
- ✅ Combat coordination and group tactics

**User Interface:**
- ✅ Comprehensive status displays and information panels
- ✅ Autopilot system with behavior toggles
- ✅ Notification system with multiple message types
- ✅ Tribe management and diplomacy interfaces
- ✅ Visual highlighting and feedback systems
- ✅ Complete audio system with effects and music

**Social Systems:**
- ✅ Complex family relationships and care systems
- ✅ Child feeding and parental care mechanics
- ✅ Social behaviors (jealousy, defense, cooperation)
- ✅ Leadership succession and tribal hierarchies

### 8.2 Future Features

**Wildlife System:**
- Predators and prey animals that populate the world
- Predators hunt prey animals for survival
- Prey animals eat berries, creating resource competition with humans
- Humans can hunt prey animals for food (meat source)
- Predators compete with humans for territory and resources
- Predators can hunt humans, creating additional survival challenge
- Dynamic ecosystem with predator-prey-human relationships

**Tribe Camps:**
- Designated world fragments owned and controlled by tribes
- Food storage systems for long-term resource management
- Defensive structures and tribal headquarters
- Centralized resource distribution and planning

**Game Persistence:**
- Save and load game functionality
- Continue long-term tribal civilizations across sessions
- Preserve world state and tribal progress

**Game Modes:**
- **Sandbox Mode (Adam & Eve)**: Start with two characters and build civilization from scratch
- **Mission Mode**: Structured scenarios with specific objectives and challenges
- Varied starting conditions and gameplay objectives



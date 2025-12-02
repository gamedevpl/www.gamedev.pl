# Tribe2 - Game Design Document

## Core Concept

Tribe2 is a settlement management game where the player takes on the role of a tribe leader who plans building placement. Unlike Tribe1 where the player controls a single character, in Tribe2 the player focuses on strategic planning while AI-controlled tribe members handle the execution.

## Player Role

- **Primary Responsibility**: Plan building placement
- **Authority**: Only the tribe leader can decide on new building placement
- **AI Handling**: Everything else is managed by AI (resource gathering, construction, job assignments, etc.)

## Building System

### Residential Buildings

- **HQ (Headquarters)**: Where the tribe leader lives. The main base that cannot be destroyed.
- **Minor HQ**: Where important tribe members live (not tribe leader), such as heirs or parents of large families within the tribe.
- **House**: Where a single family lives.
- **Kindergarten**: Where infants can stay while parents are busy.

### Resource & Food Buildings

- **Warehouse**: Where resources are stored.
- **Tavern**: Where tribe members can eat.

### Wood Production Chain

- **Forest Ranger's Hut**: Replants trees to ensure sustainable wood supply for the lumberjack.
- **Lumberjack's Hut**: Gathers wood, a primary building material.
- **Sawmill**: Processes raw wood into valuable wood planks.

### Mining & Stone

- **Quarryman's Hut/Mine**: Gathers stone or mines various ores (iron, gold, coal, granite) found in deposits across the map.

### Food Production

- **Fisherman's Hut**: Provides food from the water.
- **Hunter's Hut**: Produces meat.
- **Farm (Wheat) & Windmill/Bakery**: Production chain - grows wheat, mills it into flour, and bakes bread.
- **Pig Farm & Butcher**: Production chain for sausages/meat.

### Metal & Tool Production

- **Iron Foundry & Blacksmith**: Smelts iron ore into iron, then forges tools or weapons.
- **Gold Foundry**: Processes gold ore into gold for the treasury.
- **Tool Maker's Shop**: Creates tools required for constructing advanced buildings and employing new settlers.

### Transportation

- **Ship Maker's Shop**: Produces ships to transport settlers and goods across water (if applicable to the map).

### Military Buildings

- **Guard Hut/Tower**: Basic military buildings that station soldiers and expand controlled territory.
- **Garrison**: Larger military building that can house more soldiers.
- **Castle/Headquarters**: The starting building and powerful military structure.
- **Barracks**: Training facility for soldiers.

## Job Assignment System

### Automatic Assignment
- Idle tribe members are automatically assigned to buildings
- **Requirement**: Must be adults
- **Family Tradition**: Children are usually assigned to the same profession as their parents
- **Flexibility**: If no job available in parent's profession, children may work on something else

### Dedicated Professions

#### Building Constructor
- Specialized profession for construction work
- Takes resources from:
  - Storehouse
  - Directly from quarry/sawmill

#### Carrier
- Dedicated job for transporting resources and goods
- Essential for logistics between buildings

## Resource Management

### Terrain-Based Resources
The game world features different biomes and terrain types that affect resource availability:

- **Water**: Required for fishing (Fisherman's Hut)
- **Mountains/Rock**: Required for mining (Quarryman's Hut/Mine)
- **Grass/Ground**: Suitable for farming (cannot farm on sand)
- **Forest**: Source of wood (Lumberjack's Hut)

### Production Chains
Resources flow through production chains:
- Wood → Wood Planks (Sawmill)
- Wheat → Flour → Bread (Farm → Windmill → Bakery)
- Pigs → Meat (Pig Farm → Butcher)
- Iron Ore → Iron → Tools/Weapons (Iron Foundry → Blacksmith/Tool Maker)
- Gold Ore → Gold (Gold Foundry)

## Base Mechanics from Tribe1

Tribe2 maintains the underlying world mechanics from Tribe1:
- AI behavior trees
- Tribe dynamics and social structures
- Family relationships
- Generation tracking
- Game over when player's tribe is eliminated
- Toroidal world (wrapping at edges)

## Future Development Notes

This design document captures the planned features for Tribe2. The current implementation focuses on establishing the baseline with:
- World rendering (Canvas 2D)
- Terrain system (height, biome, water)
- Basic entity and AI systems from Tribe1

Building placement, resource management, and job assignment systems will be implemented in future iterations.

## Building Lifecycle & Mechanics (NEW REQUIREMENTS)

### Building States
1. **Planned** - Player marks location, AI assigns builders
2. **Under Construction** - Builders gather resources and construct
3. **Operational** - Fully functional, workers can be assigned
4. **Damaged** - Can be damaged by enemies, weather, or age
5. **Marked for Demolition** - Player or enemy marks for destruction  
6. **Demolished** - Being torn down, resources being recovered
7. **Disappeared** - Fully removed from game

### Demolition System
- **Demolition Tool**: Dedicated tool on player's action belt for marking buildings
- **Resource Recovery**: Demolished buildings return stone, wood, and other materials
- **Enemy Demolition**: Enemy tribes can attack and demolish buildings
- **Building Capture**: Enemies can capture buildings instead of demolishing them

### Context Menu
Right-click on any building to access:
- Building information (health, workers, production rate)
- Worker assignment/management
- Production priorities
- Mark for demolition
- Upgrade options
- Building history/events

## Job System & AI Behaviors (TO BE IMPLEMENTED)

### Required Jobs for All Buildings

Each building type requires specific professions with dedicated AI behaviors:

#### Construction & Logistics
- **Building Constructor**: Takes resources from warehouse/source, constructs buildings
  - AI: Pathfinding to building site, resource gathering, construction animation
  - States: Idle, GatheringResources, Constructing, Resting
- **Carrier**: Transports resources between buildings
  - AI: Route optimization, load management, delivery prioritization
  - States: Idle, PickingUp, Carrying, Delivering

#### Wood Production
- **Lumberjack**: Chops trees, delivers to sawmill
  - AI: Find nearest tree, chop, carry to sawmill
  - States: Idle, WalkingToTree, Chopping, CarryingWood
- **Forest Ranger**: Plants new trees
  - AI: Find empty spots in forest biome, plant saplings
  - States: Idle, WalkingToPlantSite, Planting
- **Sawmill Worker**: Processes logs into planks
  - AI: Wait for logs, process, output planks
  - States: Idle, Processing, Stocking

#### Food Production
- **Fisherman**: Catches fish from water
  - AI: Walk to water, cast line, wait, catch
  - States: Idle, WalkingToWater, Fishing, CarryingFish
- **Hunter**: Hunts prey animals
  - AI: Track prey, chase, kill, carry to butcher
  - States: Idle, Tracking, Hunting, CarryingMeat
- **Farmer**: Plants/harvests wheat
  - AI: Till soil, plant seeds, water, harvest
  - States: Idle, Tilling, Planting, Watering, Harvesting
- **Windmill Worker**: Grinds wheat into flour
  - States: Idle, Grinding, Stocking
- **Baker**: Bakes bread from flour
  - States: Idle, Baking, Stocking
- **Pig Farmer**: Raises pigs for meat
  - States: Idle, Feeding, Slaughtering
- **Butcher**: Processes meat into sausages
  - States: Idle, Processing, Stocking

#### Mining & Metalwork
- **Quarryman/Miner**: Mines stone and ores
  - AI: Walk to mine, extract resources, carry to smelter
  - States: Idle, WalkingToMine, Mining, CarryingOre
- **Iron Foundry Worker**: Smelts iron ore
  - States: Idle, Smelting, Stocking
- **Gold Foundry Worker**: Smelts gold ore  
  - States: Idle, Smelting, Stocking
- **Blacksmith**: Forges tools and weapons
  - States: Idle, Forging, Stocking
- **Tool Maker**: Creates specialized tools
  - States: Idle, Crafting, Stocking

#### Service & Military
- **Tavern Worker**: Serves food to tribe members
  - States: Idle, Serving, Cleaning
- **Kindergarten Caretaker**: Watches children
  - States: Idle, Supervising, Feeding
- **Guard**: Defends territory
  - States: Idle, Patrolling, Fighting
- **Soldier**: Military unit
  - States: Idle, Training, Fighting, Defending

### Job Assignment AI
- **Automatic Assignment**: Idle adults automatically assigned to buildings needing workers
- **Family Tradition**: Children usually follow parents' profession when possible
- **Flexibility**: If no jobs available in same profession, assign elsewhere
- **Leader Authority**: Only tribe leader can build new buildings
- **Priority System**: Critical jobs (food, defense) get workers first

### Inter-Job Interactions
- Carriers move resources between production buildings
- Builders request resources from carriers/warehouses
- Food producers supply taverns
- Tool makers supply construction projects
- Guards respond to threats near buildings
- Workers return home (houses) when tired

## Implementation Status

### ✅ Completed (Baseline)
- Tribe1 core mechanics (AI, entities, behaviors, tribes)
- Terrain system (height, biomes, water)
- Canvas 2D rendering
- Toroidal world wrapping
- Game over conditions

### 📋 To Implement
- [ ] Building placement UI and controls
- [ ] Demolition tool on action belt
- [ ] Building context menu system
- [ ] 20+ job-specific AI behavior trees
- [ ] Building lifecycle state machines
- [ ] Resource gathering and production chains
- [ ] Worker assignment system
- [ ] Building construction mechanics
- [ ] Resource recovery from demolition
- [ ] Enemy building capture mechanics
- [ ] All building types and their specific behaviors

## Notes
- No rabbits needed - Prey and Predators are sufficient
- Focus on economic gameplay, not individual character control
- All underlying Tribe1 mechanics preserved

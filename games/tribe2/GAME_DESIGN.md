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

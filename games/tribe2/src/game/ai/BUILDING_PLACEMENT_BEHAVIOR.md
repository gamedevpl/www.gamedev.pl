# Building Placement Behavior

## Overview

The building placement behavior enables tribe leaders to autonomously place buildings (storage spots and planting zones) to support their tribe's growth and sustainability.

## Behavior Logic

This behavior is integrated into the human behavior tree and runs periodically for tribe leaders only. It evaluates the tribe's current needs and decides whether to place new buildings.

### When it runs

- **Frequency**: Every 12 game hours (configurable via `BUILDING_PLACEMENT_CHECK_COOLDOWN_HOURS`)
- **Who**: Only tribe leaders (humans where `leaderId === id`)
- **Minimum tribe size**: Tribe must have at least 5 members

### What it does

The behavior makes decisions about two types of buildings:

#### 1. Storage Spots

Storage spots are placed when:
- Storage utilization exceeds 60% (`STORAGE_UTILIZATION_THRESHOLD`), OR
- The tribe has no storage and is large enough (≥5 members)

**Purpose**: Provides centralized food storage to help tribes manage resources better, especially during times of abundance.

#### 2. Planting Zones

Planting zones are placed when:
- The tribe has fewer zones than `floor(tribeMembers / 8)`
- One planting zone per 8 tribe members (`PLANTING_ZONE_MEMBERS_PER_ZONE`)

**Purpose**: Organizes agricultural activities and allows for more efficient food production through structured planting areas.

### Building placement logic

When a building is needed, the behavior:
1. Finds the tribe's center (average position of all tribe members)
2. Tries up to 20 random positions within a 300px radius
3. Validates each position using `canPlaceBuilding()` to ensure:
   - No overlap with existing entities
   - No overlap with other buildings
   - Valid position on the map
4. Places the first valid building found

## Integration

The behavior is added to the human behavior tree at strategic priority:

```
Priority order in behavior tree:
1. Survival & immediate defense
2. Player commands
3. Leader combat strategy
4. Diplomacy (leader)
5. **Building placement (leader)** ← NEW
6. Tribe combat
7. Resource gathering & storage
8. ... (other behaviors)
```

This placement ensures leaders consider building placement after diplomatic concerns but before routine resource management.

## Testing

The behavior includes comprehensive tests that verify:

1. **Buildings are placed**: Storage spots and planting zones are created as tribes grow
2. **Correct placement**: Buildings are placed within 300px of tribe center
3. **Tribe sustainability**: The behavior helps tribes survive and grow over time

Test results from 10-year simulation:
- Storage spots were successfully placed when utilization was high
- Buildings were consistently placed near tribe centers
- Tribes survived and grew with the behavior active

## Configuration Constants

All behavior parameters are configurable in `building-placement-behavior.ts`:

```typescript
const BUILDING_PLACEMENT_CHECK_COOLDOWN_HOURS = 12;  // Check frequency
const MIN_TRIBE_SIZE_FOR_BUILDINGS = 5;              // Minimum tribe size
const STORAGE_UTILIZATION_THRESHOLD = 0.6;           // Storage threshold (60%)
const PLANTING_ZONE_MEMBERS_PER_ZONE = 8;            // Members per zone
const BUILDING_PLACEMENT_SEARCH_RADIUS = 300;        // Search radius
const BUILDING_PLACEMENT_ATTEMPTS = 20;              // Placement attempts
```

## Impact on Gameplay

This behavior provides several benefits:

1. **Autonomous growth**: Tribes grow more sustainably without player intervention
2. **Resource management**: Storage spots help tribes stockpile food for lean times
3. **Organization**: Planting zones structure agricultural activities
4. **Strategic depth**: Leaders make intelligent infrastructure decisions
5. **Scalability**: Building placement scales with tribe size

## Future Enhancements

Potential improvements:
- Different building types based on tribe needs (defensive structures, workshops, etc.)
- More sophisticated placement algorithms (considering terrain, threats, etc.)
- Building maintenance and upgrades
- Tribe specialization (agricultural vs. hunting tribes)
- Resource costs for building construction

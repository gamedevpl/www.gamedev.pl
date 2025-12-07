import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, CooldownNode, Selector, Sequence } from '../nodes';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { BuildingType } from '../../../building-consts';
import { canPlaceBuilding, createBuilding } from '../../../utils/building-placement-utils';
import { getTribeMembers } from '../../../utils/family-tribe-utils';
import { getTribeStorageSpots, getStorageUtilization, getTribePlantingZones } from '../../../utils/tribe-food-utils';
import { getTribeCenter } from '../../../utils/spatial-utils';
import { Vector2D } from '../../../utils/math-types';

const BUILDING_PLACEMENT_CHECK_COOLDOWN_HOURS = 12; // Check every 12 hours
const MIN_TRIBE_SIZE_FOR_BUILDINGS = 5; // Minimum tribe size before placing buildings
const STORAGE_UTILIZATION_THRESHOLD = 0.6; // Place storage when utilization > 60%
const PLANTING_ZONE_MEMBERS_PER_ZONE = 8; // One planting zone per 8 members
const BUILDING_PLACEMENT_SEARCH_RADIUS = 300; // Search radius around tribe center
const BUILDING_PLACEMENT_ATTEMPTS = 20; // Number of random positions to try

/**
 * Finds an optimal position for a building near the tribe center.
 * Tries multiple random positions and picks the first valid one.
 * 
 * @param tribeCenter The center of the tribe
 * @param buildingType The type of building to place
 * @param ownerId The ID of the tribe leader
 * @param context The update context
 * @returns A valid position, or null if none found
 */
function findBuildingPlacementPosition(
  tribeCenter: Vector2D,
  buildingType: BuildingType,
  ownerId: number,
  context: UpdateContext,
): Vector2D | null {
  const { gameState } = context;
  
  // Try multiple random positions
  for (let attempt = 0; attempt < BUILDING_PLACEMENT_ATTEMPTS; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * BUILDING_PLACEMENT_SEARCH_RADIUS;
    
    const position: Vector2D = {
      x: tribeCenter.x + Math.cos(angle) * distance,
      y: tribeCenter.y + Math.sin(angle) * distance,
    };
    
    // Wrap position to map bounds
    position.x = ((position.x % gameState.mapDimensions.width) + gameState.mapDimensions.width) % gameState.mapDimensions.width;
    position.y = ((position.y % gameState.mapDimensions.height) + gameState.mapDimensions.height) % gameState.mapDimensions.height;
    
    // Check if building can be placed here
    if (canPlaceBuilding(position, buildingType, ownerId, gameState)) {
      return position;
    }
  }
  
  return null;
}

/**
 * Creates a behavior tree branch for tribe leaders to place buildings (storage spots and planting zones).
 * 
 * This behavior is responsible for:
 * - Deciding when to place storage spots (based on storage utilization)
 * - Deciding when to place planting zones (based on tribe size)
 * - Finding optimal locations for buildings near the tribe center
 * - Actually placing the buildings
 * 
 * The behavior runs periodically on a cooldown to avoid excessive checks.
 * 
 * @param depth The depth of this node in the behavior tree
 * @returns A behavior node for building placement
 */
export function createBuildingPlacementBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new CooldownNode(
    BUILDING_PLACEMENT_CHECK_COOLDOWN_HOURS,
    new Sequence(
      [
        // Only leaders should place buildings
        new ConditionNode(
          (human) => {
            const isLeader = human.leaderId === human.id;
            return [isLeader, isLeader ? 'Is tribe leader' : 'Not a tribe leader'];
          },
          'Check if Leader',
          depth + 1,
        ),

        // Tribe must be large enough
        new ConditionNode(
          (human, context) => {
            const tribeMembers = getTribeMembers(human, context.gameState);
            const isLargeEnough = tribeMembers.length >= MIN_TRIBE_SIZE_FOR_BUILDINGS;
            return [
              isLargeEnough,
              isLargeEnough
                ? `Tribe has ${tribeMembers.length} members`
                : `Tribe too small (${tribeMembers.length}/${MIN_TRIBE_SIZE_FOR_BUILDINGS})`,
            ];
          },
          'Check Tribe Size',
          depth + 1,
        ),

        // Try to place a storage spot or planting zone
        new Selector(
          [
            // Branch A: Place a storage spot if needed
            new Sequence(
              [
                new ConditionNode(
                  (human, context) => {
                    if (!human.leaderId) return [false, 'No tribe'];

                    const storageUtilization = getStorageUtilization(human.leaderId, context.gameState);
                    const tribeMembers = getTribeMembers(human, context.gameState);
                    const storageSpots = getTribeStorageSpots(human.leaderId, context.gameState);
                    
                    // Need storage if:
                    // 1. Utilization is high (> 60%), OR
                    // 2. No storage exists and tribe is growing
                    const needsStorage =
                      storageUtilization > STORAGE_UTILIZATION_THRESHOLD ||
                      (storageSpots.length === 0 && tribeMembers.length >= MIN_TRIBE_SIZE_FOR_BUILDINGS);

                    return [
                      needsStorage,
                      needsStorage
                        ? `Storage util: ${(storageUtilization * 100).toFixed(0)}%, Spots: ${storageSpots.length}`
                        : `Storage adequate: ${(storageUtilization * 100).toFixed(0)}%`,
                    ];
                  },
                  'Check Storage Need',
                  depth + 2,
                ),

                new ActionNode(
                  (human, context) => {
                    if (!human.leaderId) return [NodeStatus.FAILURE, 'No tribe'];

                    const tribeCenter = getTribeCenter(human.leaderId, context.gameState);
                    const position = findBuildingPlacementPosition(
                      tribeCenter,
                      BuildingType.StorageSpot,
                      human.leaderId,
                      context,
                    );

                    if (!position) {
                      return [NodeStatus.FAILURE, 'No valid position found for storage'];
                    }

                    // Create the storage spot
                    createBuilding(position, BuildingType.StorageSpot, human.leaderId, context.gameState);

                    return [
                      NodeStatus.SUCCESS,
                      `Placed storage at (${position.x.toFixed(0)}, ${position.y.toFixed(0)})`,
                    ];
                  },
                  'Place Storage Spot',
                  depth + 2,
                ),
              ],
              'Storage Placement Sequence',
              depth + 1,
            ),

            // Branch B: Place a planting zone if needed
            new Sequence(
              [
                new ConditionNode(
                  (human, context) => {
                    if (!human.leaderId) return [false, 'No tribe'];

                    const tribeMembers = getTribeMembers(human, context.gameState);
                    const plantingZones = getTribePlantingZones(human, context.gameState);
                    
                    // Need planting zone if we have fewer zones than members/8
                    const targetZones = Math.floor(tribeMembers.length / PLANTING_ZONE_MEMBERS_PER_ZONE);
                    const needsPlantingZone = plantingZones.length < targetZones;

                    return [
                      needsPlantingZone,
                      needsPlantingZone
                        ? `Need zone: ${plantingZones.length}/${targetZones} (${tribeMembers.length} members)`
                        : `Zones adequate: ${plantingZones.length}/${targetZones}`,
                    ];
                  },
                  'Check Planting Zone Need',
                  depth + 2,
                ),

                new ActionNode(
                  (human, context) => {
                    if (!human.leaderId) return [NodeStatus.FAILURE, 'No tribe'];

                    const tribeCenter = getTribeCenter(human.leaderId, context.gameState);
                    const position = findBuildingPlacementPosition(
                      tribeCenter,
                      BuildingType.PlantingZone,
                      human.leaderId,
                      context,
                    );

                    if (!position) {
                      return [NodeStatus.FAILURE, 'No valid position found for planting zone'];
                    }

                    // Create the planting zone
                    createBuilding(position, BuildingType.PlantingZone, human.leaderId, context.gameState);

                    return [
                      NodeStatus.SUCCESS,
                      `Placed planting zone at (${position.x.toFixed(0)}, ${position.y.toFixed(0)})`,
                    ];
                  },
                  'Place Planting Zone',
                  depth + 2,
                ),
              ],
              'Planting Zone Placement Sequence',
              depth + 1,
            ),
          ],
          'Building Type Selection',
          depth + 1,
        ),
      ],
      'Building Placement Behavior',
      depth,
    ),
    'Building Placement Cooldown',
    depth,
  );
}

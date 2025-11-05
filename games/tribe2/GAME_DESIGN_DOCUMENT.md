# Game Design Document (Working Title: Tribe 2)

Version: 0.1 (Initial Draft)
Owner: gtanczyk

1. Vision and High Concept

- You lead a developing settlement and guide its growth by placing buildings and fine-tuning how those buildings operate. Individuals in the tribe act autonomously and cannot be directly controlled.
- The world supports both a peaceful sandbox experience (single tribe) and a competitive experience (multiple tribes expanding, competing for land and resources, and engaging in combat).
- Territory is defined by the placement and influence of your structures. Military buildings can protect and assert control over land.

2. Design Pillars

- Indirect Control: Players set intentions by placing buildings and setting policies; individuals choose how to execute tasks.
- Living Economy: Resource chains, logistics, and storage management drive growth.
- Evolving Territory: Buildings expand and shape borders; conflict emerges naturally from territorial pressure.
- Meaningful Conflict: Military presence, defense, and raids matter, but economy remains the foundation of power.

3. Game Modes
   3.1 Sandbox (Single Tribe)

- Objective: Build, optimize, and experiment without pressure from rival tribes.
- Map: Same systems as competitive, but no enemy settlement growth (optional wildlife/neutral threats).
- Win/Loss: Open-ended; optional milestones/achievements (population size, tech tiers, landmark builds).

  3.2 Competitive (Multiple Tribes)

- Objective: Expand, secure resources, and outcompete rivals economically, territorially, or militarily.
- Rival Factions: AI-controlled tribes follow the same autonomy/economy rules.
- Victory Conditions (initial ideas):
  - Territorial Dominance: Control majority of the map’s valuable regions.
  - Economic Supremacy: Reach target production, net worth, or trade dominance.
  - Military Victory: Capture/destroy key enemy structures or force surrender.
- Optional Settings: Starting distance, number of rivals, aggression, resource richness, fog of war.

4. Player Agency and Controls

- Building Placement: Choose sites for structures within owned/claimable territory. Placement previews show footprint, terrain suitability, and territory influence.
- Building Micro-Management: Adjust priorities, worker capacity, work hours, input/output limits, production recipes, and maintenance schedules.
- Global Policies: Settlement-wide priorities (e.g., "food first", "stockpile wood"), labor allocation caps, and alert thresholds.
- No Direct Unit Control: Individuals select tasks based on roles, proximity, priorities, needs, and building demands.

5. Tribe Simulation

- Roles and Jobs: Individuals adopt roles (e.g., builder, carrier, farmer, miner, artisan, guard). Roles can be constrained by building needs and policies.
- Needs: Basic needs (food, rest, shelter, safety). Needs affect productivity and task choice.
- Task Selection: Utility-based AI considering distance, urgency (e.g., starving), building queues, and policy weights.
- Pathfinding and Logistics: Road networks and storage placement affect travel time and throughput.

6. Economy and Resources

- Core Resources: Wood, stone, clay, ore, coal, food types (berries, fish, bread, meat), fiber/flax, tools, weapons, and construction materials (planks, bricks).
- Production Chains (examples):
  - Logging Camp -> Wood -> Sawmill -> Planks
  - Clay Pit -> Clay -> Kiln -> Bricks
  - Farm -> Grain -> Mill -> Flour -> Bakery -> Bread
  - Mine -> Ore -> Smelter -> Ingots -> Smithy -> Tools/Weapons
- Storage and Transport: General warehouses and specialized yards define stock limits and distribution rules. Carriers haul between buildings based on pull-based requests.
- Markets and Consumption: Housing consumes food and goods; better variety boosts happiness and population growth.

7. Buildings
   7.1 Categories

- Civic/Housing: Huts, houses, town centers, wells.
- Production: Logging camps, sawmills, farms, mills, bakeries, kilns, smelters, smithies, fisheries, tanneries.
- Storage/Logistics: Warehouses, yards, granaries, depots, roads.
- Military: Barracks, castles, outposts, watchtowers (increase security, extend influence, enable garrisons).

  7.2 Military Buildings (Land Control and Defense)

- Barracks: Recruits and houses militia/guards; boosts defense in nearby radius; enables patrols.
- Castle: Strong territorial anchor with wide influence radius; high garrison capacity; powerful defenses; slow/expensive to build.
- Outpost: Medium-range territorial control point; moderate garrison; quicker to deploy; ideal for forward expansion.
- Watchtower: Small footprint, low-cost vision and light territorial claim; limited garrison; early warning.
- Influence and Territory: Each structure projects an influence radius. Military buildings apply stronger, defensive influence and can contest enemy control.

8. Territory and Ownership System

- Claim by Building: Territory is defined by the accumulated influence of buildings. Placement outside territory may require a nearby outpost/tower to extend claim.
- Contested Zones: Overlapping influence from rival tribes creates contested areas. Construction is restricted or slowed in these zones.
- Protection: Within the radius of military buildings, structures gain defense bonuses and safer logistics.
- Loss and Decay: Destroyed or decommissioned structures reduce local influence. Isolated enclaves can lose connection penalties or gradually decay in claim strength.

9. Combat and Security

- Autonomy: Individuals assigned as guards/militia respond to threats, patrol routes, and garrison automatically based on policies.
- Engagement: Skirmishes occur when rival patrols or raiders enter defended zones. Garrisoned units gain positional and structure-based bonuses.
- Siege/Assault (later milestone): Structure hit points, armor, repair tasks, and siege equipment.
- Casualties and Recovery: Wounded require rest/medicine; recruitment draws from population and consumes weapons/equipment.

10. Rival Tribes (AI)

- Same Rules: AI uses the same building and autonomy systems.
- Personalities: Expansionist, turtling, opportunistic trader, raider.
- Behavior Loops: Scout for resources, establish footholds with outposts/towers, secure logistics, then scale economy and military.

11. Progression and Research

- Tech/Unlocks: New buildings, improved recipes, logistics upgrades (pack animals, carts), fortifications, training.
- Soft Progression: Better housing enables higher population ceilings; improved tools boost productivity.

12. World and Map

- Biomes and Resources: Forests, rivers, fertile fields, hills with ore, clay deposits.
- Weather/Seasons (optional milestone): Affects yields, movement, and consumption.
- Wildlife/Neutral Threats: Bandits, predators, or environmental hazards in sandbox/competitive.

13. UI/UX

- Placement Overlay: Footprint, allowed/forbidden tiles, pathing hints, and projected territory influence.
- Territory View: Owned, contested, enemy, and neutral zones; military coverage heatmap.
- Alerts: Starvation, low stocks, contested borders, raids, idle production due to missing inputs.
- Building Panels: Worker slots, priority sliders, on/off toggles, input/output caps, recipe selection.

14. Balancing Framework (Initial)

- Economy Pace: Target early shelter and food within 5–10 minutes; first expansion outpost within 15–25 minutes.
- Territory Tuning: Military buildings have the strongest influence; production buildings provide lighter, local claim.
- Combat Lethality: Early skirmishes are survivable but costly in time/resources; sieges require preparation.

15. Technical Notes

- Target Platform: Web (TypeScript + Vite). Desktop via browser initially.
- Simulation: Deterministic tick with priority queues; save/load via serialized game state.
- Data-Driven Content: JSON/config-driven buildings, recipes, techs to allow iteration without code changes.
- Performance: Chunked map, job batching, and pathfinding caching.

16. Roadmap (Milestones)

- M1 Core Loop (Sandbox):
  - Map generation, resource nodes, basic building placement, workers, storage, carriers.
  - Food chain (farm -> mill -> bakery), wood chain (logging -> sawmill), simple housing.
  - Territory via building influence (non-contested).
- M2 Territory & Logistics:
  - Influence visualization, roads, stock limits, distribution rules.
- M3 Military Foundations:
  - Watchtowers/outposts influence and garrison; patrol behavior; contested zones.
- M4 Competitive Mode:
  - AI tribe expansion, simple personalities, victory tracking.
- M5 Combat Depth:
  - Barracks recruitment, castle defenses, repair tasks, morale/wounds.

17. Constraints and Non-Goals (for now)

- No direct micromanagement of individuals; control is via buildings and policies.
- Avoid overly granular citizen simulation beyond what impacts gameplay.

18. Glossary

- Influence: Abstract measure determining territorial control around structures.
- Garrison: Units stationed in a defensive structure, providing protection and control.
- Contested Zone: Area influenced by multiple tribes where control is undecided.

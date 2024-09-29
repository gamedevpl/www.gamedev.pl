import { BattleState, Unit, CommanderOrder, Position, ArenaDimensions } from './battle-state-types';
import { ARENA_SIZE } from './battle-state-consts';

function getRandomPosition(): Position {
  return {
    x: Math.random() * ARENA_SIZE,
    y: Math.random() * ARENA_SIZE,
    z: 0,
  };
}

function createUnit(id: string, side: 'red' | 'blue', type: 'warrior' | 'archer' | 'tank' | 'artillery'): Unit {
  return {
    id,
    commanderId: `${side}-commander`,
    side,
    type,
    position: getRandomPosition(),
    health: 100,
  };
}

function createCommander(side: 'red' | 'blue'): Unit {
  const commanderOrder: CommanderOrder = {
    formationCenter: { x: 50, y: 50, z: 0 },
    formationWidth: 10,
    formationHeight: 10,
  };

  return {
    id: `${side}-commander`,
    commanderId: `${side}-commander`,
    side,
    type: 'commander',
    position: { x: 50, y: 50, z: 0 },
    health: 100,
    commanderOrder,
  };
}

export function initBattleState(): BattleState {
  const units: Unit[] = [];

  // Create 10 units for each side
  const unitTypes: ('warrior' | 'archer' | 'tank' | 'artillery')[] = ['warrior', 'archer', 'tank', 'artillery'];

  for (let i = 0; i < 10; i++) {
    units.push(createUnit(`red-unit-${i}`, 'red', unitTypes[i % unitTypes.length]));
    units.push(createUnit(`blue-unit-${i}`, 'blue', unitTypes[i % unitTypes.length]));
  }

  // Create commanders for each side
  units.push(createCommander('red'));
  units.push(createCommander('blue'));

  // Set default arena dimensions
  const arenaDimensions: ArenaDimensions = {
    width: ARENA_SIZE, // Default width
    height: ARENA_SIZE, // Default height
  };

  return {
    time: 0,
    units,
    missiles: [],
    effects: [],
    arena: arenaDimensions,
  };
}

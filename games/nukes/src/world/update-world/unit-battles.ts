import { Battle, Battles, StateId, Unit, Strategy } from '../world-state-types';
import { IndexedWorldState } from '../world-state-index';
import { BATTLE_DAMAGE_RATIO, BATTLE_MIN_DAMAGE } from '../world-state-constants';

export function findBattles(worldState: IndexedWorldState): Battles {
  const battles: Battles = [];

  for (const unit of worldState.units) {
    for (const battle of battles) {
      if (
        unit.rect.left < battle.rect.right &&
        unit.rect.right > battle.rect.left &&
        unit.rect.top < battle.rect.bottom &&
        unit.rect.bottom > battle.rect.top
      ) {
        battle.units.push(unit);
        // Update battle rect and position
        battle.rect = {
          left: Math.min(battle.rect.left, unit.rect.left),
          top: Math.min(battle.rect.top, unit.rect.top),
          right: Math.max(battle.rect.right, unit.rect.right),
          bottom: Math.max(battle.rect.bottom, unit.rect.bottom),
        };
        battle.position = {
          x: (battle.rect.left + battle.rect.right) / 2,
          y: (battle.rect.top + battle.rect.bottom) / 2,
        };
        battle.size = Math.max(battle.rect.right - battle.rect.left, battle.rect.bottom - battle.rect.top);
        break;
      }
    }

    const unitState = worldState.states.find((state) => state.id === unit.stateId);

    for (const otherUnit of worldState.searchUnit.byRect(unit.rect)) {
      if (otherUnit.stateId === unit.stateId || unitState?.strategies[otherUnit.stateId] !== Strategy.HOSTILE) {
        continue;
      }

      const newBattle: Battle = {
        units: [unit, otherUnit],
        rect: {
          left: Math.min(unit.rect.left, otherUnit.rect.left),
          top: Math.min(unit.rect.top, otherUnit.rect.top),
          right: Math.max(unit.rect.right, otherUnit.rect.right),
          bottom: Math.max(unit.rect.bottom, otherUnit.rect.bottom),
        },
        position: {
          x: (Math.min(unit.rect.left, otherUnit.rect.left) + Math.max(unit.rect.right, otherUnit.rect.right)) / 2,
          y: (Math.min(unit.rect.top, otherUnit.rect.top) + Math.max(unit.rect.bottom, otherUnit.rect.bottom)) / 2,
        },
        size: Math.max(
          Math.abs(unit.rect.right - otherUnit.rect.left),
          Math.abs(unit.rect.bottom - otherUnit.rect.top),
        ),
      };
      battles.push(newBattle);
      break;
    }
  }

  return battles;
}

export function resolveBattles(units: Unit[], battles: Battles, deltaTime: number): Unit[] {
  for (const battle of battles) {
    const quantities = battle.units.reduce(
      (acc, unit) => ((acc[unit.stateId] = (acc[unit.stateId] ?? 0) + unit.quantity), acc),
      {} as Record<StateId, number>,
    );
    const totalQuantity = Object.values(quantities).reduce((acc, quantity) => (acc = acc + quantity), 0);
    if (!totalQuantity) {
      continue;
    }

    battle.units.forEach((unit) => {
      unit.quantity = Math.max(
        0,
        unit.quantity -
          Math.max(
            BATTLE_MIN_DAMAGE * deltaTime,
            (quantities[unit.stateId] / totalQuantity) * deltaTime * BATTLE_DAMAGE_RATIO * unit.quantity,
          ),
      );
    });
  }

  return units;
}

export function isUnitInBattle(unit: Unit, battles: Battles): boolean {
  for (const battle of battles) {
    if (battle.units.find((u) => u.id === unit.id)) {
      return true;
    }
  }
  return false;
}

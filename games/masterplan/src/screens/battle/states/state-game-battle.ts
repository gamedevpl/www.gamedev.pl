import { GameWorld } from '../game/game-world';
import { MasterPlan } from '../game/masterplan/masterplan';
import { SoldierObject } from '../game/objects/object-soldier';
import { GameHUD } from '../game/game-hud';
import { freeCanvas } from '../util/canvas';
import {
  EVENT_TIMEOUT,
  EVENT_RAF,
  EVENT_INTERVAL_100MS,
  EVENT_INTERVAL_SECOND,
  EVENT_DAMAGE,
  EVENT_DAMAGE_ARROW,
  EVENT_MOUSE_CLICK,
} from '../events';
import { renderGame } from '../game/game-render';
import { VMath } from '../util/vmath';
import { LAYER_DEFAULT, EDGE_RADIUS } from '../consts';
import { dispatchCustomEvent } from '../../../../../nukes/src/events';
import { stateInit } from '../states';
import { Unit } from '../../designer/designer-types';

export function createMasterPlan(world: GameWorld, direction: 1 | -1, color: string, definitions: Unit[]) {
  const angle = (Math.PI / 2) * direction;
  const initialPosition: [number, number] = [0, (direction * EDGE_RADIUS) / 2];
  const masterPlan = new MasterPlan(initialPosition, definitions);

  for (let i = 0; i < masterPlan.getSoldierCount(); i++) {
    const soldierPlan = masterPlan.getSolderPlan(i);
    let pos = soldierPlan.getPosition();

    pos = VMath.add(pos, initialPosition);
    world.addObject(
      new SoldierObject(pos[0], pos[1], angle + Math.PI, soldierPlan, world, color, masterPlan.getType(i)),
    );
  }
}

export function stateGameBattleInit(definitions: Unit[], definitionsEnemy: Unit[]) {
  const world = new GameWorld();

  createMasterPlan(world, 1, '#ff0000', definitions);
  createMasterPlan(world, -1, '#00ff00', definitionsEnemy);

  const HUD = new GameHUD(world);

  HUD.setNames('Player', 'Computer');

  return function GameBattleInitHandler(eventType: number) {
    renderGame(world);
    HUD.render(world);

    if (eventType == EVENT_TIMEOUT) {
      return stateGameBattle(world, HUD);
    }
  };
}

function stateGameBattle(world: GameWorld, HUD: GameHUD) {
  const damageMap: Record<number, Record<string, number>> = {
    [EVENT_DAMAGE]: {
      '#ff0000': 0,
      '#00ff00': 0,
    },
    [EVENT_DAMAGE_ARROW]: {
      '#ff0000': 0,
      '#00ff00': 0,
    },
  };
  const damageCount = JSON.parse(JSON.stringify(damageMap));

  return function GameBattleHandler(eventType: number, eventObject: unknown) {
    if (eventType == EVENT_RAF) {
      let elapsedTime = Math.min(eventObject as number, 1000);
      while (elapsedTime > 0) {
        elapsedTime = world.update(elapsedTime);
      }

      renderGame(world);
    }

    if (eventType === EVENT_INTERVAL_100MS) {
      HUD.render(world);
    }

    if (eventType === EVENT_INTERVAL_SECOND) {
      const balance = HUD.getBalance(world);
      if (world.getTime() > 60000 || balance === 0 || balance === 1) {
        return stateGameBattleEnd(world, HUD);
      }
    }

    if (eventType === EVENT_DAMAGE || eventType === EVENT_DAMAGE_ARROW) {
      const { damage, soldier } = eventObject as { damage: number; soldier: SoldierObject };
      damageMap[eventType][soldier.color] += damage;
      damageCount[eventType][soldier.color]++;
    }
  };
}

function stateGameBattleEnd(world: GameWorld, HUD: GameHUD) {
  HUD.renderResults(world);

  return function GameBattleEndHandler(eventType: number) {
    renderGame(world);

    if (eventType === EVENT_MOUSE_CLICK) {
      freeCanvas(LAYER_DEFAULT);
      HUD.destroy();
      dispatchCustomEvent('battleEnd');
      return stateInit();
    }
  };
}

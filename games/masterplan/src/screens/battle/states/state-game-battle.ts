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
import { Unit } from '../../designer/designer-screen';

export function stateGameBattleInit(definitions: Unit[], definitionsEnemy: Unit[]) {
  var world = new GameWorld();

  var createMasterPlan = (direction: 1 | -1, color: string, definitions: Unit[]) => {
    var angle = (Math.PI / 2) * direction;
    var initialPosition: [number, number] = [0, (direction * EDGE_RADIUS) / 2];
    var masterPlan = new MasterPlan(initialPosition, definitions);

    for (var i = 0; i < masterPlan.getSoldierCount(); i++) {
      var soldierPlan = masterPlan.getSolderPlan(i);
      var pos = soldierPlan.getPosition();

      pos = VMath.add(pos, initialPosition);
      world.addObject(
        new SoldierObject(pos[0], pos[1], angle + Math.PI, soldierPlan, world, color, masterPlan.getType(i)),
      );
    }
  };

  createMasterPlan(1, '#ff0000', definitions);
  createMasterPlan(-1, '#00ff00', definitionsEnemy);

  var HUD = new GameHUD(world);

  HUD.setNames('Player', 'Computer');

  return function GameBattleInitHandler(eventType: number) {
    renderGame(world);
    HUD.render(world);

    if (eventType == EVENT_TIMEOUT) {
      return stateGameBattle(world, HUD);
    }
  };
}

export function stateGameBattle(world: GameWorld, HUD: GameHUD) {
  var damageTotal = 0;
  var damageMap: Record<number, Record<string, number>> = {
    [EVENT_DAMAGE]: {
      '#ff0000': 0,
      '#00ff00': 0,
    },
    [EVENT_DAMAGE_ARROW]: {
      '#ff0000': 0,
      '#00ff00': 0,
    },
  };
  var damageCount = JSON.parse(JSON.stringify(damageMap));

  return function GameBattleHandler(eventType: number, eventObject: unknown) {
    if (eventType == EVENT_RAF) {
      var elapsedTime = Math.min(eventObject as number, 1000);
      while (elapsedTime > 0) {
        elapsedTime = world.update(elapsedTime);
      }

      renderGame(world);
    }

    if (eventType === EVENT_INTERVAL_100MS) {
      HUD.render(world);
    }

    if (eventType === EVENT_INTERVAL_SECOND) {
      // console.log("Damage total: " + damageTotal);
      // console.log("Damage: " + JSON.stringify(damage));
      // console.log("Damage count: " + JSON.stringify(damageCount));

      var balance = HUD.getBalance(world);
      if (world.getTime() > 60000 || balance === 0 || balance === 1) {
        return stateGameBattleEnd(world, HUD);
      }
    }

    if (eventType === EVENT_DAMAGE || eventType === EVENT_DAMAGE_ARROW) {
      const { damage, soldier } = eventObject as { damage: number; soldier: SoldierObject };
      damageTotal += damage;
      damageMap[eventType][soldier.color] += damage;
      damageCount[eventType][soldier.color]++;
    }
  };
}

export function stateGameBattleEnd(world: GameWorld, HUD: GameHUD) {
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

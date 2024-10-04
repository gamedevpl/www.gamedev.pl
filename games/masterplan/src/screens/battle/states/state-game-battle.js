import { GameWorld } from '../game/game-world.js';
import { MasterPlan } from '../game/masterplan/masterplan.js';
import { SoldierObject } from '../game/objects/object-soldier.js';
import { GameHUD } from '../game/game-hud.js';
import { freeCanvas } from '../util/canvas.js';
import {
  EVENT_TIMEOUT,
  EVENT_RAF,
  EVENT_INTERVAL_100MS,
  EVENT_INTERVAL_SECOND,
  EVENT_DAMAGE,
  EVENT_DAMAGE_ARROW,
  EVENT_MOUSE_CLICK,
} from '../events.js';
import { renderGame } from '../game/game-render.js';
import { VMath } from '../util/vmath.js';
import { LAYER_DEFAULT, EDGE_RADIUS } from '../consts.js';
import { dispatchCustomEvent } from '../../../../../nukes/src/events.ts';
import { stateInit } from '../states.js';

export function stateGameBattleInit(definitions, definitionsEnemy) {
  var world = new GameWorld();

  var createMasterPlan = (direction, color, definitions) => {
    var angle = (Math.PI / 2) * direction;
    var initialPosition = [0, (direction * EDGE_RADIUS) / 2];
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

  HUD.setNames(definitions.username, definitionsEnemy.username || 'Computer');

  return function GameBattleInitHandler(eventType) {
    renderGame(world, HUD);
    HUD.render(world);

    if (eventType == EVENT_TIMEOUT) {
      return new stateGameBattle(world, HUD, definitions, definitionsEnemy);
    }
  }.WeakState(1000);
}

export function stateGameBattle(world, HUD, definitions, definitionsEnemy) {
  var damageTotal = 0;
  var damage = {
    [EVENT_DAMAGE]: {
      '#ff0000': 0,
      '#00ff00': 0,
    },
    [EVENT_DAMAGE_ARROW]: {
      '#ff0000': 0,
      '#00ff00': 0,
    },
  };
  var damageCount = JSON.parse(JSON.stringify(damage));

  return function GameBattleHandler(eventType, eventObject) {
    if (eventType == EVENT_RAF) {
      var elapsedTime = Math.min(eventObject, 1000);
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
        return new stateGameBattleEnd(world, HUD, definitions, definitionsEnemy);
      }
    }

    if (eventType === EVENT_DAMAGE || eventType === EVENT_DAMAGE_ARROW) {
      damageTotal += eventObject.damage;
      damage[eventType][eventObject.soldier.color] += eventObject.damage;
      damageCount[eventType][eventObject.soldier.color]++;
    }
  };
}

export function stateGameBattleEnd(world, HUD, definitions, definitionsEnemy) {
  var result = HUD.renderResults(world);
  return function GameBattleEndHandler(eventType) {
    renderGame(world);

    if (eventType === EVENT_MOUSE_CLICK) {
      freeCanvas(LAYER_DEFAULT);
      HUD.destroy();
      if (result === '#ff0000' && !definitionsEnemy.username) {
        var newEnemy = JSON.parse(JSON.stringify(definitions));
        delete newEnemy.username;
        // return new stateGameDesigner(definitions, newEnemy);
        dispatchCustomEvent('battleEnd');
      } else {
        // return new stateGameDesigner(definitions, definitionsEnemy);
        dispatchCustomEvent('battleEnd');
      }
      return stateInit();
    }
  };
}

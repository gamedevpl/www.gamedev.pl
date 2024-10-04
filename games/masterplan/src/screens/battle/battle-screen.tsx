import { useEffect, useRef } from 'react';

import { useCustomEvent } from '../../../../nukes/src/events';

import { Unit } from '../designer/designer-screen';

import assetSoldierWarrior from './assets/soldier-warrior.png';
import assetSoldierWarriorDead from './assets/soldier-warrior-dead.png';

import assetSoldierArcher from './assets/soldier-archer.png';
import assetSoldierArcherDead from './assets/soldier-archer-dead.png';

import assetSoldierTank from './assets/soldier-tank.png';
import assetSoldierTankDead from './assets/soldier-tank-dead.png';

import assetSoldierArtillery from './assets/soldier-artillery.png';
import assetSoldierArtilleryDead from './assets/soldier-artillery-dead.png';
import { BattleStyles } from './battle-styles';
import './main';
import { initCurrentState, updateState } from './states';
import { EVENT_BATTLE_START, EVENT_INTERVAL_100MS, EVENT_INTERVAL_SECOND, EVENT_RAF, EVENT_TIMEOUT } from './events';
import { useRafLoop } from 'react-use';
import { BattleControls } from './battle-controls';

export function BattleScreen({
  onBattleEnd,
  playerUnits,
  oppositionUnits,
}: {
  onBattleEnd: () => void;
  playerUnits: Unit[];
  oppositionUnits: Unit[];
}) {
  useEffect(() => {
    initCurrentState();

    updateState(EVENT_BATTLE_START, {
      playerUnits: playerUnits,
      oppositionUnits: oppositionUnits,
    });

    const timeout = setTimeout(() => updateState(EVENT_TIMEOUT), 1000);
    const interval100ms = setInterval(() => updateState(EVENT_INTERVAL_100MS), 100);
    const interval1s = setInterval(() => updateState(EVENT_INTERVAL_SECOND), 1000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval100ms);
      clearInterval(interval1s);
    };
  }, []);

  useCustomEvent('battleEnd', () => {
    onBattleEnd();
  });

  const lastTickRef = useRef<number>();

  useRafLoop(() => {
    let newTick = Date.now();
    if (lastTickRef.current) {
      updateState(EVENT_RAF, newTick - lastTickRef.current);
    }
    lastTickRef.current = newTick;
  });

  return (
    <>
      <BattleStyles />
      <BattleControls />

      {/* assets */}
      <img src={assetSoldierWarrior} id="asset-soldier-warrior" />
      <img src={assetSoldierWarriorDead} id="asset-soldier-warrior-dead" />
      <img src={assetSoldierArcher} id="asset-soldier-archer" />
      <img src={assetSoldierArcherDead} id="asset-soldier-archer-dead" />
      <img src={assetSoldierTank} id="asset-soldier-tank" />
      <img src={assetSoldierTankDead} id="asset-soldier-tank-dead" />
      <img src={assetSoldierArtillery} id="asset-soldier-artillery" />
      <img src={assetSoldierArtilleryDead} id="asset-soldier-artillery-dead" />
      {/* HUD */}
      <div id="game-hud">
        <div id="battle-stats">
          <div id="battle-time"> </div>
          <div id="battle-balance">
            <div id="battle-balance-left"> </div>
            <div id="battle-balance-right"> </div>
          </div>
        </div>
        <div id="battle-result"></div>
      </div>
    </>
  );
}

import { useEffect } from 'react';

import { useCustomEvent, dispatchCustomEvent } from '../../nukes/src/events';

import { Unit } from './components/DesignerScreen';

import assetSoldierWarrior from './assets/soldier-warrior.png';
import assetSoldierWarriorDead from './assets/soldier-warrior-dead.png';

import assetSoldierArcher from './assets/soldier-archer.png';
import assetSoldierArcherDead from './assets/soldier-archer-dead.png';

import assetSoldierTank from './assets/soldier-tank.png';
import assetSoldierTankDead from './assets/soldier-tank-dead.png';

import assetSoldierArtillery from './assets/soldier-artillery.png';
import assetSoldierArtilleryDead from './assets/soldier-artillery-dead.png';

export function OldApp({ onBattleEnd, units }: { onBattleEnd: () => void; units: Unit[] }) {
  useEffect(() => {
    import('./js/main').then(() => {
      dispatchCustomEvent('battleStart', { units });
    });
  }, []);

  useCustomEvent('battleEnd', () => {
    onBattleEnd();
  });

  return (
    <>
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

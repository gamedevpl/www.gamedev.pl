import { useEffect, useRef } from 'react';

import { useCustomEvent } from '../../../../nukes/src/events';

import { Unit } from '../designer/designer-types';

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

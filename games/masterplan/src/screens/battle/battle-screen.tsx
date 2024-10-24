import { useEffect, useRef, useState } from 'react';

import { useCustomEvent } from '../../../../nukes/src/events';

import { Unit } from '../designer/designer-types';

import { BattleStyles } from './battle-styles';
import './main';
import { initCurrentState, updateState } from './states';
import {
  EVENT_BATTLE_START,
  EVENT_INTERVAL_100MS,
  EVENT_INTERVAL_SECOND,
  EVENT_RAF,
  EVENT_TIMEOUT,
  EVENT_BATTLE_PAUSE,
  EVENT_BATTLE_RESUME,
  EVENT_BATTLE_STOP,
} from './events';
import { useRafLoop } from 'react-use';
import { BattleControls } from './battle-controls';
import { TerrainData } from './game/terrain/terrain-generator';

export function BattleScreen({
  onBattleEnd,
  playerUnits,
  oppositionUnits,
  terrainData,
}: {
  onBattleEnd: () => void;
  playerUnits: Unit[];
  oppositionUnits: Unit[];
  terrainData: TerrainData;
}) {
  const [isPaused, setIsPaused] = useState(false);
  const intervalsRef = useRef<{
    timeout?: NodeJS.Timeout;
    interval100ms?: NodeJS.Timeout;
    interval1s?: NodeJS.Timeout;
  }>({});

  useEffect(() => {
    initCurrentState();

    updateState(EVENT_BATTLE_START, {
      playerUnits: playerUnits,
      oppositionUnits: oppositionUnits,
      terrainData: terrainData,
    });

    startIntervals();

    return () => {
      clearIntervals();
    };
  }, []);

  const startIntervals = () => {
    intervalsRef.current.timeout = setTimeout(() => updateState(EVENT_TIMEOUT), 1000);
    intervalsRef.current.interval100ms = setInterval(() => updateState(EVENT_INTERVAL_100MS), 100);
    intervalsRef.current.interval1s = setInterval(() => updateState(EVENT_INTERVAL_SECOND), 1000);
  };

  const clearIntervals = () => {
    if (intervalsRef.current.timeout) clearTimeout(intervalsRef.current.timeout);
    if (intervalsRef.current.interval100ms) clearInterval(intervalsRef.current.interval100ms);
    if (intervalsRef.current.interval1s) clearInterval(intervalsRef.current.interval1s);
  };

  useCustomEvent('battleEnd', () => {
    onBattleEnd();
  });

  const lastTickRef = useRef<number>();
  const [stop, start] = useRafLoop(() => {
    if (isPaused) return;

    const newTick = Date.now();
    if (lastTickRef.current) {
      updateState(EVENT_RAF, newTick - lastTickRef.current);
    }
    lastTickRef.current = newTick;
  }, true);

  const handlePauseResume = () => {
    if (isPaused) {
      updateState(EVENT_BATTLE_RESUME);
      startIntervals();
      start();
    } else {
      updateState(EVENT_BATTLE_PAUSE);
      clearIntervals();
      stop();
    }
    setIsPaused(!isPaused);
  };

  const handleStop = () => {
    updateState(EVENT_BATTLE_STOP);
    clearIntervals();
    stop();
    onBattleEnd();
  };

  return (
    <>
      <BattleStyles />
      <BattleControls />

      {/* HUD */}
      <div id="game-hud">
        <div id="hud-top-right">
          <div id="battle-stats">
            <div id="battle-balance">
              <div id="battle-balance-left"> </div>
              <div id="battle-balance-right"> </div>
            </div>
            <div id="battle-time"> </div>
          </div>
          <div id="battle-result"></div>
          <div id="battle-controls">
            <button onClick={handlePauseResume}>{isPaused ? 'Resume' : 'Pause'}</button>
            <button onClick={handleStop}>Exit</button>
          </div>
        </div>
      </div>
    </>
  );
}

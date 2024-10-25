import { createGlobalStyle } from 'styled-components';

export const BattleStyles = createGlobalStyle`
#game-hud {
  position: fixed;
  z-index: 2;
  pointer-events: none;
  width: 100%;
  height: 100%;
  display: block;
}

#hud-top-right {
  position: fixed;
  top: 20px;
  right: 20px;
  display: flex;
  align-items: flex-start;
  gap: 16px;
  pointer-events: all;
}

#battle-controls {
  display: flex;
  gap: 10px;

  button {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    cursor: pointer;
    font-size: 14px;
    white-space: nowrap;
    transition: background-color 0.2s ease;
  }

  button:hover {
    background: rgba(0, 0, 0, 0.8);
  }
}

#battle-result:empty {
  display: none;
}

#battle-result:not(:empty) div {
  width: 404px;
  height: 300px;
  color: white;
  left: 50%;
  top: 50%;
  margin: -150px -150px;
  text-align: center;
  position: absolute;
  font-size: 30px;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 4px;
  padding: 20px;
  backdrop-filter: blur(5px);
}

#battle-result:not(:empty) {
  width: 100%;
  height: 100%;
  display: block;
  background: rgba(0, 0, 0, 0.3);
  position: fixed;
  top: 0;
  left: 0;
}

#battle-result span.result {
  color: white;
  font-weight: bold;
  animation: blinker 1s linear infinite;
}

@keyframes blinker {
  50% {
    opacity: 0;
  }
}

#battle-result span.winner {
  position: absolute;
  top: 80px;
  left: 0px;
  right: 0px;
  font-weight: bold;
}

#battle-result span.loser {
  position: absolute;
  top: 120px;
  left: 0px;
  right: 0px;
}

#battle-result span.continue {
  color: white;
  position: absolute;
  font-size: 15px;
  bottom: 5px;
  left: 5px;
}

#battle-result span {
  display: block;
}

#battle-stats {
  background: rgba(0, 0, 0, 0.7);
  padding: 6px 16px;
  border-radius: 4px;
  color: white;
  min-width: 300px;
  backdrop-filter: blur(5px);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  gap: 16px;
}

#battle-time {
  font-size: 14px;
  color: white;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  min-width: 100px;
}

#battle-time:before {
  content: attr(data-time);
  display: block;
}

/* Battle Balance Styles */
#battle-balance {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
}

#battle-balance-left, #battle-balance-right {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  transition: width 0.3s ease-in-out;
  position: relative;
}

#battle-balance-left {
  background: linear-gradient(90deg, #ff0000, #ff4444);
}

#battle-balance-right {
  background: linear-gradient(90deg, #44ff44, #00ff00);
}

#battle-balance-left:after, #battle-balance-right:after {
  content: attr(data-percentage);
  position: absolute;
  top: -18px;
  font-size: 12px;
  color: white;
}

#battle-balance-left:after {
  right: 0;
}

#battle-balance-right:after {
  left: 0;
}

#battle-balance-left[data-winning="true"] {
  animation: pulse-red 2s infinite;
}

#battle-balance-right[data-winning="true"] {
  animation: pulse-green 2s infinite;
}

@keyframes pulse-red {
  0% {
    filter: brightness(1);
  }
  50% {
    filter: brightness(1.3);
  }
  100% {
    filter: brightness(1);
  }
}

@keyframes pulse-green {
  0% {
    filter: brightness(1);
  }
  50% {
    filter: brightness(1.3);
  }
  100% {
    filter: brightness(1);
  }
}

canvas#layer-default {
  max-width: 100vw;
  max-height: 100vh;
  position: absolute;
  pointer-events: none;
  z-index: 1;
}
`;

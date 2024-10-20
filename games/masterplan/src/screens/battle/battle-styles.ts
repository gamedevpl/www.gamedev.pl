import { createGlobalStyle } from 'styled-components';

export const BattleStyles = createGlobalStyle`
#game-hud {
  position: fixed;
  z-index: 2;
  pointer-events: none;
  width: 100%;
  height: 100%;
  display: none;
  font-family: monospace;
}

#battle-result:empty {
  display: none;
}

#battle-result:not(:empty) div {
  width: 404px;
  height: 300px;
  color: red;
  left: 50%;
  top: 50%;
  margin: -150px -150px;
  text-align: center;
  position: absolute;
  font-size: 30px;
  background: rgba(0, 0, 0, 0.25);
}

#battle-result:not(:empty) {
  width: 100%;
  height: 100%;
  display: block;
  background: rgba(0, 0, 0, 0.3);
  position: fixed;
}

#battle-result span.result {
  color: black;
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
  position: absolute;
  background: rgba(0, 0, 0, 0.25);
  padding: 20px;
}

#battle-time:before {
  content: 'Timer: ' attr(data-time);
  display: block;
  font-size: 30px;
  margin-bottom: 10px;
  color: white;
}

#battle-balance:before {
  display: block;
  content: "Who is winning?";
  font-size: 30px;
  width: 300px;
  color: white;
}

#battle-balance-left {
  height: 30px;
  width: 50%;
  background: red;
  float: left;
}


#battle-balance-right {
  height: 30px;
  width: 50%;
  background: #0fde0f;
  float: right;
}

#battle-balance-left, #battle-balance-right {
  overflow: hidden;
  text-overflow: 'hidden';
}

#battle-balance-left[data-winning=true], #battle-balance-right[data-winning=true] {
  border: 1px solid yellow;
  box-sizing: border-box;
}

#battle-balance-left[data-username]:before, #battle-balance-right[data-username]:before {
  display: block;
  content: attr(data-username);
  margin-left: 3px;
}

#battle-balance-left[data-winning=true]:before, #battle-balance-right[data-winning=true]:before {
  display: block;
  content: "Winning!";
  margin-left: 3px;
}



canvas#layer-default {
  max-width: 100vw;
  max-height: 100vh;
  position: absolute;
  pointer-events: none;
  z-index: 1;
}
`;

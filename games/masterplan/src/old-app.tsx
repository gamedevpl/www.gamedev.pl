import React from 'react';

import assetSoldierWarrior from './assets/soldier-warrior.png';
import assetSoldierWarriorDead from './assets/soldier-warrior-dead.png';

import assetSoldierArcher from './assets/soldier-archer.png';
import assetSoldierArcherDead from './assets/soldier-archer-dead.png';

import assetSoldierTank from './assets/soldier-tank.png';
import assetSoldierTankDead from './assets/soldier-tank-dead.png';

import assetSoldierArtillery from './assets/soldier-artillery.png';
import assetSoldierArtilleryDead from './assets/soldier-artillery-dead.png';

import './js/main';

export function OldApp() {
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

      {/* intro */}
      <div id="game-intro">
        <h1>MasterPlan</h1>
        <p>
          MasterPlan is a <u>offline multiplayer</u> strategy game. It's battle gameplay is inspired by{' '}
          <a href="https://en.wikipedia.org/wiki/Legion_Gold">Legion Gold (2002)</a>
        </p>
        <h2>How to play?</h2>
        <ol>
          <li>Create your master plan</li>
          <li>Play Battle</li>
          <li>Share with other player to compete</li>
        </ol>
        <p>Available units:</p>
        <ul>
          <li>
            <div className="field-unit" data-unit-type="warrior">
              {' '}
            </div>{' '}
            - Warrior: Fast, Fragile, Deadly
          </li>
          <li>
            <div className="field-unit" data-unit-type="archer">
              {' '}
            </div>{' '}
            - Archer: Kills from distance, dies fast.
          </li>
          <li>
            <div className="field-unit" data-unit-type="tank">
              {' '}
            </div>{' '}
            - Tank: Powerful, and slow.
          </li>
          <li>
            <div className="field-unit" data-unit-type="artillery">
              {' '}
            </div>{' '}
            - Artillery: 2 shots, stationary.
          </li>
        </ul>
        <br />
        <center>
          <button>Click here to play</button>
        </center>
        <div id="hint" style={{ marginTop: '50px', textAlign: 'center' }}></div>
      </div>
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
      {/* Designer */}
      <div id="game-designer">
        <div id="battle-versus"></div>
        <h1>Create Master Plan</h1>
        <div className="designer-area" style={{ paddingBottom: '10px', borderBottom: '5px solid black' }}>
          <div id="designer-field"></div>
          <div style={{ background: 'rgba(0, 0, 0, 0.1)', padding: '2px 3px' }}>
            <span style={{ float: 'right' }}>
              <input id="battle-string" /> <button id="battle-string-load">Load plan</button>
            </span>{' '}
            Select unit to change formation, type or commands. Drag to move.
            <div style={{ clear: 'both' }}> </div>
          </div>
          <div id="designer-formation" className="designer-unit-option">
            <h3>Formation</h3>
            <button className="formation-button" data-formation="4x4">
              4x4
            </button>
            <button className="formation-button" data-formation="16x1">
              16x1
            </button>
            <button className="formation-button" data-formation="1x16">
              1x16
            </button>
            <button className="formation-button" data-formation="8x2">
              8x2
            </button>
            <button className="formation-button" data-formation="2x8">
              2x8
            </button>
          </div>
          <div id="designer-actions">
            <h3>Battle!</h3>
            <button id="button-test-battle">Play</button>
            vs
            <input id="test-battle-string" />
            <br />
          </div>
          <div id="designer-commands" className="designer-unit-option">
            <h3>Commands</h3>
            <button data-command="wait-advance">Wait&Advance</button>
            <button data-command="advance">Advance</button>
            <button data-command="advance-wait">Advance&Wait</button>
            <button data-command="flank-left">Flank Left</button>
            <button data-command="flank-right">Flank Right</button>
          </div>
          <div id="designer-unit-type" className="designer-unit-option">
            <h3>Unit Type</h3>
            <button data-unit-type="warrior">Warriors</button>
            <button data-unit-type="tank">Tanks</button>
            <button data-unit-type="archer">Archers</button>
            <button data-unit-type="cavalry" disabled>
              Cavalry (WIP)
            </button>
            <button data-unit-type="artillery">Artillery</button>
          </div>
        </div>
        <div id="designer-share" style={{ marginTop: '20px' }}>
          <div>
            <h2>Share</h2>
            <p>
              What's your name/twitter username? <input id="username" placeholder="Bonaparte" />
            </p>
            <p>
              <b>Share link: </b>
              <input id="sharelink" style={{ width: '500px' }} />
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

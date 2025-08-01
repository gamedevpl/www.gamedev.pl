import React from 'react';
import { GameWorldState } from '../game/world-types';
import { 
  getEcosystemBalancerStats, 
  isQLearningEnabled 
} from '../game/ecosystem/ecosystem-balancer';
import {
  ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT,
  ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION,
  ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION,
  MAP_WIDTH,
  MAP_HEIGHT,
} from '../game/world-consts';
import { IndexedWorldState } from '../game/world-index/world-index-types';

interface EcosystemDebuggerProps {
  gameState: GameWorldState;
  isVisible: boolean;
}

interface PopulationHistory {
  time: number;
  prey: number;
  predators: number;
  bushes: number;
}

// Global history storage (persists across component re-renders)
let populationHistory: PopulationHistory[] = [];
let lastRecordTime = 0;

const HISTORY_INTERVAL = 3600; // Record every hour (in game time)
const MAX_HISTORY_LENGTH = 200; // Keep last 200 data points

export const EcosystemDebugger: React.FC<EcosystemDebuggerProps> = ({
  gameState,
  isVisible,
}) => {
  if (!isVisible) {
    return null;
  }

  const preyCount = (gameState as IndexedWorldState).search.prey.count();
  const predatorCount = (gameState as IndexedWorldState).search.predator.count();
  const bushCount = (gameState as IndexedWorldState).search.berryBush.count();

  // Record population data
  if (gameState.time - lastRecordTime >= HISTORY_INTERVAL) {
    populationHistory.push({
      time: gameState.time,
      prey: preyCount,
      predators: predatorCount,
      bushes: bushCount,
    });
    
    // Keep history at reasonable size
    if (populationHistory.length > MAX_HISTORY_LENGTH) {
      populationHistory = populationHistory.slice(-MAX_HISTORY_LENGTH);
    }
    
    lastRecordTime = gameState.time;
  }

  const mapArea = MAP_WIDTH * MAP_HEIGHT;
  const preyDensityPer1000 = (preyCount / mapArea) * 1000000; // per 1000 pixels²
  const predatorDensityPer1000 = (predatorCount / mapArea) * 1000000;
  const bushDensityPer1000 = (bushCount / mapArea) * 1000000;

  const qlStats = getEcosystemBalancerStats();
  const isQLEnabled = isQLearningEnabled();

  // Calculate simple histogram for current populations
  const createHistogramBar = (current: number, target: number, maxHeight: number = 100) => {
    const percentage = Math.min((current / target) * 100, 200); // Cap at 200%
    const height = (percentage / 200) * maxHeight;
    const color = percentage < 50 ? '#ff4444' : percentage < 80 ? '#ffaa44' : percentage > 120 ? '#44aaff' : '#44ff44';
    
    return {
      height,
      color,
      percentage: Math.round(percentage),
    };
  };

  const preyBar = createHistogramBar(preyCount, ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION);
  const predatorBar = createHistogramBar(predatorCount, ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION);
  const bushBar = createHistogramBar(bushCount, ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT);

  // Time series mini-chart (last 20 data points)
  const recentHistory = populationHistory.slice(-20);
  const maxValues = {
    prey: Math.max(...recentHistory.map(h => h.prey), ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION),
    predators: Math.max(...recentHistory.map(h => h.predators), ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION),
    bushes: Math.max(...recentHistory.map(h => h.bushes), ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT),
  };

  const gameYear = Math.floor(gameState.time / (24 * 365));
  const gameDay = Math.floor((gameState.time % (24 * 365)) / 24);
  const gameHour = Math.floor(gameState.time % 24);

  return (
    <div
      style={{
        position: 'fixed',
        top: '10px',
        right: '10px',
        width: '400px',
        maxHeight: '80vh',
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        color: 'white',
        padding: '15px',
        borderRadius: '8px',
        fontFamily: 'monospace',
        fontSize: '12px',
        zIndex: 1000,
        overflowY: 'auto',
        border: '2px solid #444',
      }}
    >
      <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px', color: '#66ccff' }}>
        🔧 Ecosystem Debugger
      </div>
      
      <div style={{ marginBottom: '15px' }}>
        <div><strong>Game Time:</strong> Year {gameYear}, Day {gameDay}, Hour {gameHour}</div>
        <div><strong>Map Size:</strong> {MAP_WIDTH} × {MAP_HEIGHT} pixels</div>
      {/* Enhanced Q-Learning Information */}
      <div style={{ marginBottom: '15px' }}>
        <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>
          🧠 Q-Learning Status
        </div>
        <div><strong>Mode:</strong> {isQLEnabled ? '✅ Active' : '❌ Disabled'}</div>
        {qlStats && (
          <>
            <div><strong>Q-Table Size:</strong> {qlStats.qTableSize} entries</div>
            <div><strong>Exploration Rate:</strong> {(qlStats.explorationRate * 100).toFixed(1)}%</div>
          </>
        )}
        <div style={{ fontSize: '10px', color: '#888', marginTop: '3px' }}>
          Enhanced state space includes:<br/>
          • Population levels & ratios<br/>
          • Population density per 1000px²<br/>
          • Population trends<br/>
          • Map-aware density targets<br/>
          • Improved reward function with sigmoid curves<br/>
          • Better extinction prevention penalties
        </div>
      </div>
      </div>

      {/* Current Population Histogram */}
      <div style={{ marginBottom: '15px' }}>
        <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>
          📊 Current Populations
        </div>
        <div style={{ display: 'flex', alignItems: 'end', gap: '10px', height: '100px' }}>
          <div style={{ textAlign: 'center', minWidth: '80px' }}>
            <div
              style={{
                width: '20px',
                height: `${preyBar.height}px`,
                backgroundColor: preyBar.color,
                margin: '0 auto',
                borderRadius: '2px 2px 0 0',
              }}
            />
            <div style={{ fontSize: '10px', marginTop: '2px' }}>
              Prey<br />
              {preyCount} / {ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION}<br />
              ({preyBar.percentage}%)
            </div>
          </div>
          <div style={{ textAlign: 'center', minWidth: '80px' }}>
            <div
              style={{
                width: '20px',
                height: `${predatorBar.height}px`,
                backgroundColor: predatorBar.color,
                margin: '0 auto',
                borderRadius: '2px 2px 0 0',
              }}
            />
            <div style={{ fontSize: '10px', marginTop: '2px' }}>
              Predators<br />
              {predatorCount} / {ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION}<br />
              ({predatorBar.percentage}%)
            </div>
          </div>
          <div style={{ textAlign: 'center', minWidth: '80px' }}>
            <div
              style={{
                width: '20px',
                height: `${bushBar.height}px`,
                backgroundColor: bushBar.color,
                margin: '0 auto',
                borderRadius: '2px 2px 0 0',
              }}
            />
            <div style={{ fontSize: '10px', marginTop: '2px' }}>
              Bushes<br />
              {bushCount} / {ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT}<br />
              ({bushBar.percentage}%)
            </div>
          </div>
        </div>
      </div>

      {/* Population Density */}
      <div style={{ marginBottom: '15px' }}>
        <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>
          📏 Density (per 1000 px²)
        </div>
        <div>Prey: {preyDensityPer1000.toFixed(2)} (target: {((ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION / mapArea) * 1000000).toFixed(2)})</div>
        <div>Predators: {predatorDensityPer1000.toFixed(2)} (target: {((ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION / mapArea) * 1000000).toFixed(2)})</div>
        <div>Bushes: {bushDensityPer1000.toFixed(2)} (target: {((ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT / mapArea) * 1000000).toFixed(2)})</div>
      </div>

      {/* Current Parameters */}
      <div style={{ marginBottom: '15px' }}>
        <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>
          ⚙️ Current Parameters
        </div>
        <div style={{ fontSize: '10px', lineHeight: '1.3' }}>
          <div><strong>Prey:</strong></div>
          <div>• Gestation: {gameState.ecosystem.preyGestationPeriod.toFixed(1)}h</div>
          <div>• Procreation: {gameState.ecosystem.preyProcreationCooldown.toFixed(1)}h</div>
          <div>• Hunger: {gameState.ecosystem.preyHungerIncreasePerHour.toFixed(1)}/h</div>
          
          <div style={{ marginTop: '5px' }}><strong>Predators:</strong></div>
          <div>• Gestation: {gameState.ecosystem.predatorGestationPeriod.toFixed(1)}h</div>
          <div>• Procreation: {gameState.ecosystem.predatorProcreationCooldown.toFixed(1)}h</div>
          <div>• Hunger: {gameState.ecosystem.predatorHungerIncreasePerHour.toFixed(1)}/h</div>
          
          <div style={{ marginTop: '5px' }}><strong>Bushes:</strong></div>
          <div>• Spread Chance: {(gameState.ecosystem.berryBushSpreadChance * 100).toFixed(1)}%</div>
        </div>
      </div>

      {/* Population History Mini-Chart */}
      {recentHistory.length > 1 && (
        <div style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>
            📈 Population Trends (Last 20 Points)
          </div>
          <div style={{ display: 'flex', gap: '15px' }}>
            {/* Prey trend */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '10px', color: '#44ff44' }}>Prey</div>
              <svg width="100" height="30" style={{ border: '1px solid #333' }}>
                <polyline
                  points={recentHistory.map((h, i) => 
                    `${(i / (recentHistory.length - 1)) * 100},${30 - (h.prey / maxValues.prey) * 30}`
                  ).join(' ')}
                  fill="none"
                  stroke="#44ff44"
                  strokeWidth="1"
                />
                {/* Target line */}
                <line
                  x1="0"
                  y1={30 - (ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION / maxValues.prey) * 30}
                  x2="100"
                  y2={30 - (ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION / maxValues.prey) * 30}
                  stroke="#888"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                />
              </svg>
            </div>
            
            {/* Predator trend */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '10px', color: '#ff4444' }}>Predators</div>
              <svg width="100" height="30" style={{ border: '1px solid #333' }}>
                <polyline
                  points={recentHistory.map((h, i) => 
                    `${(i / (recentHistory.length - 1)) * 100},${30 - (h.predators / maxValues.predators) * 30}`
                  ).join(' ')}
                  fill="none"
                  stroke="#ff4444"
                  strokeWidth="1"
                />
                {/* Target line */}
                <line
                  x1="0"
                  y1={30 - (ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION / maxValues.predators) * 30}
                  x2="100"
                  y2={30 - (ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION / maxValues.predators) * 30}
                  stroke="#888"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                />
              </svg>
            </div>
          </div>
        </div>
      )}

      <div style={{ fontSize: '10px', color: '#888', textAlign: 'center', marginTop: '10px' }}>
        Press 'E' to toggle this debugger
      </div>
    </div>
  );
};
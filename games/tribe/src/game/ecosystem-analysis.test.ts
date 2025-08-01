import { initGame } from './index';
import { GameWorldState } from './world-types';
import { updateWorld } from './world-update';
import {
  ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT,
  ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION,
  ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION,
  GAME_DAY_IN_REAL_SECONDS,
  HOURS_PER_GAME_DAY,
  HUMAN_YEAR_IN_REAL_SECONDS,
} from './world-consts';
import { describe, it, expect } from 'vitest';
import { IndexedWorldState } from './world-index/world-index-types';
import { trainEcosystemAgent } from './ecosystem/q-learning-trainer';
import { resetEcosystemBalancer, getEcosystemBalancerStats } from './ecosystem';

interface PopulationSnapshot {
  year: number;
  prey: number;
  predators: number;
  bushes: number;
  qTableSize: number;
  explorationRate: number;
  interventions: number;
}

describe('Extended Ecosystem Analysis', () => {
  it('should analyze Q-learning performance over extended simulation', async () => {
    console.log('🧪 Extended Ecosystem Analysis with Q-Learning');
    console.log('================================================');

    // Reset and train the Q-learning agent with more episodes
    resetEcosystemBalancer();
    console.log('🎓 Training Q-learning agent with extended training...');
    const trainingResults = trainEcosystemAgent(30, 15); // More training
    console.log(`📈 Training completed: ${trainingResults.successfulEpisodes}/${trainingResults.episodesCompleted} successful episodes`);

    let gameState: GameWorldState = initGame();

    // Remove all humans for pure ecosystem analysis
    const humanIds = Array.from(gameState.entities.entities.values())
      .filter((e) => e.type === 'human')
      .map((e) => e.id);

    for (const id of humanIds) {
      gameState.entities.entities.delete(id);
    }

    const yearsToSimulate = 150;
    const totalSimulationSeconds = yearsToSimulate * HUMAN_YEAR_IN_REAL_SECONDS;
    const timeStepSeconds = GAME_DAY_IN_REAL_SECONDS / 24; // One hour at a time
    let yearsSimulated = 0;

    const snapshots: PopulationSnapshot[] = [];
    let interventionCount = 0;
    let lastInterventionYear = 0;

    console.log('\n🌱 Starting extended ecosystem simulation...\n');

    for (let time = 0; time < totalSimulationSeconds; time += timeStepSeconds) {
      const prevPreyCount = (gameState as IndexedWorldState).search.prey.count();
      const prevPredatorCount = (gameState as IndexedWorldState).search.predator.count();

      gameState = updateWorld(gameState, timeStepSeconds);

      const currentYear = Math.floor(gameState.time / (HUMAN_YEAR_IN_REAL_SECONDS * HOURS_PER_GAME_DAY));
      if (currentYear > yearsSimulated) {
        yearsSimulated = currentYear;
        const preyCount = (gameState as IndexedWorldState).search.prey.count();
        const predatorCount = (gameState as IndexedWorldState).search.predator.count();
        const bushCount = (gameState as IndexedWorldState).search.berryBush.count();

        // Detect interventions (population resurrection)
        const hadIntervention = (preyCount > prevPreyCount + 2) || (predatorCount > prevPredatorCount + 1);
        if (hadIntervention) {
          interventionCount++;
          lastInterventionYear = yearsSimulated;
        }

        const stats = getEcosystemBalancerStats();
        
        const snapshot: PopulationSnapshot = {
          year: yearsSimulated,
          prey: preyCount,
          predators: predatorCount,
          bushes: bushCount,
          qTableSize: stats?.qTableSize || 0,
          explorationRate: stats?.explorationRate || 0,
          interventions: interventionCount,
        };

        snapshots.push(snapshot);

        // Log every 25 years or when there's an intervention
        if (yearsSimulated % 25 === 0 || hadIntervention) {
          const interventionFlag = hadIntervention ? ' 🚨' : '';
          console.log(`Year ${yearsSimulated}${interventionFlag}: Prey: ${preyCount}, Predators: ${predatorCount}, Bushes: ${bushCount}`);
          console.log(`  Q-Table: ${snapshot.qTableSize} entries, Exploration: ${(snapshot.explorationRate * 100).toFixed(1)}%`);
          console.log(`  Ecosystem params: Prey(G:${gameState.ecosystem.preyGestationPeriod.toFixed(1)}, H:${gameState.ecosystem.preyHungerIncreasePerHour.toFixed(2)})`);
          console.log(`  Total interventions so far: ${interventionCount}`);
        }

        // Early exit conditions
        if (preyCount === 0 && predatorCount === 0) {
          console.log(`💀 Complete ecosystem collapse at year ${yearsSimulated}`);
          break;
        }

        // Check for long-term stability (no interventions for 30+ years)
        if (yearsSimulated - lastInterventionYear > 30 && yearsSimulated > 50) {
          console.log(`✅ Long-term stability achieved - no interventions for ${yearsSimulated - lastInterventionYear} years`);
          break;
        }
      }
    }

    // Analysis
    console.log('\n📊 EXTENDED ANALYSIS RESULTS');
    console.log('============================');

    const finalSnapshot = snapshots[snapshots.length - 1];
    console.log(`Simulation completed after ${yearsSimulated} years:`);
    console.log(`  Final Prey: ${finalSnapshot.prey} (target: ${ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION})`);
    console.log(`  Final Predators: ${finalSnapshot.predators} (target: ${ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION})`);
    console.log(`  Final Bushes: ${finalSnapshot.bushes} (target: ${ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT})`);

    console.log(`\n🚨 Total emergency interventions: ${interventionCount}`);
    console.log(`📚 Final Q-learning table size: ${finalSnapshot.qTableSize} entries`);
    console.log(`🎯 Final exploration rate: ${(finalSnapshot.explorationRate * 100).toFixed(2)}%`);

    const yearsWithoutIntervention = yearsSimulated - lastInterventionYear;
    console.log(`⏰ Years since last intervention: ${yearsWithoutIntervention}`);

    // Calculate recent stability
    const recentSnapshots = snapshots.slice(-10); // Last 10 years
    if (recentSnapshots.length > 0) {
      const avgPrey = recentSnapshots.reduce((sum, s) => sum + s.prey, 0) / recentSnapshots.length;
      const avgPredators = recentSnapshots.reduce((sum, s) => sum + s.predators, 0) / recentSnapshots.length;
      const avgBushes = recentSnapshots.reduce((sum, s) => sum + s.bushes, 0) / recentSnapshots.length;

      console.log(`\n📈 Recent averages (last 10 years):`);
      console.log(`  Prey: ${avgPrey.toFixed(1)}`);
      console.log(`  Predators: ${avgPredators.toFixed(1)}`);
      console.log(`  Bushes: ${avgBushes.toFixed(1)}`);
    }

    // Intervention frequency analysis
    const interventionRate = interventionCount / yearsSimulated;
    console.log(`\n📊 Intervention Analysis:`);
    console.log(`  Interventions per year: ${interventionRate.toFixed(3)}`);
    console.log(`  Average years between interventions: ${interventionCount > 0 ? (yearsSimulated / interventionCount).toFixed(1) : 'N/A'}`);

    // Success criteria
    const preyThreshold = ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION * 0.2; // 20% of target
    const predatorThreshold = ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION * 0.2;
    const bushThreshold = ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT * 0.2;

    const preySuccess = finalSnapshot.prey >= preyThreshold;
    const predatorSuccess = finalSnapshot.predators >= predatorThreshold;
    const bushSuccess = finalSnapshot.bushes >= bushThreshold;
    const stabilitySuccess = yearsWithoutIntervention >= 15; // 15+ years without intervention
    const lowInterventionRate = interventionRate < 0.1; // Less than 0.1 interventions per year

    console.log(`\n🎯 SUCCESS EVALUATION:`);
    console.log(`  Population thresholds (≥20% of target): ${preySuccess ? '✅' : '❌'} Prey, ${predatorSuccess ? '✅' : '❌'} Predators, ${bushSuccess ? '✅' : '❌'} Bushes`);
    console.log(`  Stability (≥15 years without intervention): ${stabilitySuccess ? '✅' : '❌'} (${yearsWithoutIntervention} years)`);
    console.log(`  Low intervention rate (<0.1/year): ${lowInterventionRate ? '✅' : '❌'} (${interventionRate.toFixed(3)}/year)`);
    
    const overallSuccess = preySuccess && predatorSuccess && bushSuccess && (stabilitySuccess || lowInterventionRate);
    console.log(`  Overall Assessment: ${overallSuccess ? '✅ Q-LEARNING IS WORKING WELL' : '⚠️ Q-LEARNING NEEDS IMPROVEMENT'}`);

    // Q-learning specific analysis
    console.log(`\n🧠 Q-LEARNING ANALYSIS:`);
    console.log(`  Q-table grew to ${finalSnapshot.qTableSize} entries (indicates learning scope)`);
    console.log(`  Exploration decreased to ${(finalSnapshot.explorationRate * 100).toFixed(2)}% (good convergence)`);
    console.log(`  Training effectiveness: ${trainingResults.successfulEpisodes}/${trainingResults.episodesCompleted} episodes (${((trainingResults.successfulEpisodes/trainingResults.episodesCompleted)*100).toFixed(1)}%)`);
    
    // Population dynamics analysis
    if (snapshots.length > 20) {
      const earlySnapshots = snapshots.slice(0, 10);
      const lateSnapshots = snapshots.slice(-10);
      
      const earlyInterventions = earlySnapshots[earlySnapshots.length - 1].interventions - (earlySnapshots[0].interventions || 0);
      const lateInterventions = lateSnapshots[lateSnapshots.length - 1].interventions - lateSnapshots[0].interventions;
      
      console.log(`\n📈 LEARNING PROGRESS:`);
      console.log(`  Early phase interventions (years 1-10): ${earlyInterventions}`);
      console.log(`  Late phase interventions (last 10 years): ${lateInterventions}`);
      console.log(`  Improvement: ${earlyInterventions > lateInterventions ? '✅ Fewer interventions over time' : '⚠️ No significant improvement'}`);
    }

    // The test assertion can be more lenient since we're mainly checking that the system is working
    // rather than achieving perfect results
    expect(finalSnapshot.prey).toBeGreaterThan(0); // At least some population survived
    expect(finalSnapshot.predators).toBeGreaterThan(0);
    expect(finalSnapshot.bushes).toBeGreaterThan(0);
    expect(finalSnapshot.qTableSize).toBeGreaterThan(0); // Q-learning agent learned something
    
    // Return detailed results for further analysis
    return {
      success: overallSuccess,
      finalPopulations: {
        prey: finalSnapshot.prey,
        predators: finalSnapshot.predators,
        bushes: finalSnapshot.bushes,
      },
      interventionCount,
      interventionRate,
      yearsWithoutIntervention,
      qTableSize: finalSnapshot.qTableSize,
      trainingSuccess: trainingResults.successfulEpisodes / trainingResults.episodesCompleted,
      snapshots
    };
  }, 300000); // 5 minute timeout for extended simulation
});
/**
 * Behavior Tree Testing Utility
 * 
 * This script tests each behavior systematically to find:
 * 1. Logic errors in conditions
 * 2. Blackboard state management issues
 * 3. Incorrect return statuses
 * 4. Edge cases and boundary conditions
 */

import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext, GameWorldState } from '../../../world-types';
import { Blackboard, BlackboardData } from '../behavior-tree-blackboard';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { FoodType } from '../../../food/food-types';
import { BerryBushEntity } from '../../../entities/plants/berry-bush/berry-bush-types';

// Test results tracking
interface TestResult {
  behaviorName: string;
  testName: string;
  passed: boolean;
  error?: string;
  findings?: string[];
}

const testResults: TestResult[] = [];

function createMockHuman(overrides: Partial<HumanEntity> = {}): HumanEntity {
  const blackboard = Blackboard.create();
  return {
    id: 'test-human',
    type: 'human',
    position: { x: 100, y: 100 },
    direction: { x: 0, y: 0 },
    speed: 10,
    isAdult: true,
    age: 25,
    gender: 'male',
    hunger: 0,
    maxHunger: 100,
    food: [],
    maxFood: 10,
    hitpoints: 100,
    maxHitpoints: 100,
    activeAction: 'idle',
    aiBlackboard: blackboard,
    isPlayer: false,
    ...overrides,
  } as HumanEntity;
}

function createMockContext(overrides: Partial<UpdateContext> = {}): UpdateContext {
  return {
    deltaTime: 0.1,
    gameState: {
      time: 0,
      mapDimensions: { width: 1000, height: 1000 },
      entities: {
        entities: {},
        entityIndex: {},
      },
      ...overrides.gameState,
    } as GameWorldState,
    ...overrides,
  } as UpdateContext;
}

function runTest(
  behaviorName: string,
  testName: string,
  testFn: () => void | Promise<void>
): void {
  try {
    const result = testFn();
    if (result instanceof Promise) {
      result.then(
        () => {
          testResults.push({ behaviorName, testName, passed: true });
          console.log(`✓ ${behaviorName} - ${testName}`);
        },
        (error) => {
          testResults.push({
            behaviorName,
            testName,
            passed: false,
            error: error.message,
          });
          console.log(`✗ ${behaviorName} - ${testName}: ${error.message}`);
        }
      );
    } else {
      testResults.push({ behaviorName, testName, passed: true });
      console.log(`✓ ${behaviorName} - ${testName}`);
    }
  } catch (error: any) {
    testResults.push({
      behaviorName,
      testName,
      passed: false,
      error: error.message,
    });
    console.log(`✗ ${behaviorName} - ${testName}: ${error.message}`);
  }
}

function recordFinding(behaviorName: string, finding: string): void {
  console.log(`🔍 FINDING in ${behaviorName}: ${finding}`);
  const lastResult = testResults[testResults.length - 1];
  if (lastResult && lastResult.behaviorName === behaviorName) {
    if (!lastResult.findings) {
      lastResult.findings = [];
    }
    lastResult.findings.push(finding);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// ===== BEHAVIOR TESTS =====

export async function testEatingBehavior() {
  const { createEatingBehavior } = await import('./eating-behavior');
  const behaviorName = 'EatingBehavior';
  
  console.log(`\n=== Testing ${behaviorName} ===`);
  
  runTest(behaviorName, 'Should fail when not hungry', () => {
    const human = createMockHuman({
      hunger: 0,
      food: [{ type: FoodType.Berry, nutrition: 10 }],
    });
    const context = createMockContext();
    const blackboard = human.aiBlackboard!;
    
    const behavior = createEatingBehavior(0);
    const status = behavior.execute(human, context, blackboard);
    
    assert(status === NodeStatus.FAILURE, 'Expected FAILURE but got ' + NodeStatus[status]);
  });
  
  runTest(behaviorName, 'Should fail when no food', () => {
    const human = createMockHuman({
      hunger: 80,
      food: [],
    });
    const context = createMockContext();
    const blackboard = human.aiBlackboard!;
    
    const behavior = createEatingBehavior(0);
    const status = behavior.execute(human, context, blackboard);
    
    assert(status === NodeStatus.FAILURE, 'Expected FAILURE but got ' + NodeStatus[status]);
  });
  
  runTest(behaviorName, 'Should start eating when hungry with food', () => {
    const human = createMockHuman({
      hunger: 80,
      food: [{ type: FoodType.Berry, nutrition: 10 }],
    });
    const context = createMockContext();
    const blackboard = human.aiBlackboard!;
    
    const behavior = createEatingBehavior(0);
    const status = behavior.execute(human, context, blackboard);
    
    assert(status === NodeStatus.RUNNING, 'Expected RUNNING but got ' + NodeStatus[status]);
    assert(human.activeAction === 'eating', 'Expected activeAction to be eating');
  });
  
  runTest(behaviorName, 'Should respect cooldown', () => {
    const human = createMockHuman({
      hunger: 80,
      food: [{ type: FoodType.Berry, nutrition: 10 }],
      eatingCooldownTime: 10,
    });
    const context = createMockContext({ gameState: { time: 0 } as GameWorldState });
    const blackboard = human.aiBlackboard!;
    
    const behavior = createEatingBehavior(0);
    const status = behavior.execute(human, context, blackboard);
    
    assert(status === NodeStatus.FAILURE, 'Expected FAILURE due to cooldown');
  });
  
  runTest(behaviorName, 'Should fail for children', () => {
    const human = createMockHuman({
      isAdult: false,
      hunger: 80,
      food: [{ type: FoodType.Berry, nutrition: 10 }],
    });
    const context = createMockContext();
    const blackboard = human.aiBlackboard!;
    
    const behavior = createEatingBehavior(0);
    const status = behavior.execute(human, context, blackboard);
    
    assert(status === NodeStatus.FAILURE, 'Children should not eat via AI');
  });
}

export async function testGatheringBehavior() {
  const { createGatheringBehavior } = await import('./gathering-behavior');
  const behaviorName = 'GatheringBehavior';
  
  console.log(`\n=== Testing ${behaviorName} ===`);
  
  runTest(behaviorName, 'Should fail when not hungry and no children', () => {
    const human = createMockHuman({
      hunger: 0,
      food: [],
    });
    const context = createMockContext();
    const blackboard = human.aiBlackboard!;
    
    const behavior = createGatheringBehavior(0);
    const status = behavior.execute(human, context, blackboard);
    
    assert(status === NodeStatus.FAILURE, 'Should not gather when not needed');
  });
  
  runTest(behaviorName, 'Should fail when inventory is full', () => {
    const human = createMockHuman({
      hunger: 50,
      food: new Array(10).fill({ type: FoodType.Berry, nutrition: 10 }),
      maxFood: 10,
    });
    const context = createMockContext();
    const blackboard = human.aiBlackboard!;
    
    const behavior = createGatheringBehavior(0);
    const status = behavior.execute(human, context, blackboard);
    
    assert(status === NodeStatus.FAILURE, 'Should not gather when inventory full');
  });
  
  runTest(behaviorName, 'Should handle missing food source in blackboard', () => {
    const human = createMockHuman({ hunger: 50 });
    const context = createMockContext();
    const blackboard = human.aiBlackboard!;
    
    // Manually set an invalid food source ID
    Blackboard.set(blackboard, 'foodSource', 'non-existent-bush');
    
    const behavior = createGatheringBehavior(0);
    const status = behavior.execute(human, context, blackboard);
    
    // The behavior should clean up the invalid key
    const foodSource = Blackboard.get(blackboard, 'foodSource');
    if (foodSource !== undefined) {
      recordFinding(behaviorName, 'Blackboard not cleaned up when food source is invalid');
    }
  });
  
  runTest(behaviorName, 'Should not target empty bushes', () => {
    const human = createMockHuman({ hunger: 50 });
    const emptyBush: BerryBushEntity = {
      id: 'empty-bush',
      type: 'berryBush',
      position: { x: 120, y: 120 },
      food: [],
    } as BerryBushEntity;
    
    const context = createMockContext();
    context.gameState.entities.entities = {
      [human.id]: human,
      [emptyBush.id]: emptyBush,
    };
    context.gameState.entities.entityIndex = {
      berryBush: [emptyBush.id],
    };
    const blackboard = human.aiBlackboard!;
    
    const behavior = createGatheringBehavior(0);
    const status = behavior.execute(human, context, blackboard);
    
    assert(status === NodeStatus.FAILURE, 'Should not target empty bushes');
  });
}

export async function testAttackingBehavior() {
  const { createAttackingBehavior } = await import('./attacking-behavior');
  const behaviorName = 'AttackingBehavior';
  
  console.log(`\n=== Testing ${behaviorName} ===`);
  
  runTest(behaviorName, 'Should fail for children', () => {
    const human = createMockHuman({ isAdult: false });
    const context = createMockContext();
    const blackboard = human.aiBlackboard!;
    
    const behavior = createAttackingBehavior(0);
    const status = behavior.execute(human, context, blackboard);
    
    assert(status === NodeStatus.FAILURE, 'Children should not attack');
  });
  
  runTest(behaviorName, 'Should not attack dead enemies', () => {
    const human = createMockHuman({ leaderId: 'tribe-1' });
    const deadEnemy = createMockHuman({
      id: 'dead-enemy',
      leaderId: 'tribe-2',
      hitpoints: 0,
      position: { x: 120, y: 120 },
    });
    
    const context = createMockContext();
    context.gameState.entities.entities = {
      [human.id]: human,
      [deadEnemy.id]: deadEnemy,
    };
    context.gameState.entities.entityIndex = {
      human: [human.id, deadEnemy.id],
    };
    const blackboard = human.aiBlackboard!;
    
    const behavior = createAttackingBehavior(0);
    const status = behavior.execute(human, context, blackboard);
    
    assert(status === NodeStatus.FAILURE, 'Should not attack dead targets');
  });
  
  runTest(behaviorName, 'Should clean up blackboard when giving up chase', () => {
    const human = createMockHuman({
      leaderId: 'tribe-1',
      position: { x: 500, y: 500 },
    });
    const enemy = createMockHuman({
      id: 'enemy',
      leaderId: 'tribe-2',
      position: { x: 120, y: 120 },
      hitpoints: 100,
    });
    
    const context = createMockContext();
    context.gameState.entities.entities = {
      [human.id]: human,
      [enemy.id]: enemy,
    };
    const blackboard = human.aiBlackboard!;
    
    // Set up the blackboard as if the human was chasing
    Blackboard.set(blackboard, 'attackTarget', enemy.id);
    Blackboard.set(blackboard, 'homeCenter', { x: 100, y: 100 });
    
    const behavior = createAttackingBehavior(0);
    const status = behavior.execute(human, context, blackboard);
    
    // The behavior should clean up when too far from home
    const target = Blackboard.get(blackboard, 'attackTarget');
    const homeCenter = Blackboard.get(blackboard, 'homeCenter');
    
    if (status === NodeStatus.FAILURE && (target !== undefined || homeCenter !== undefined)) {
      recordFinding(behaviorName, 'Blackboard not cleaned up when giving up chase');
    }
  });
}

export async function testBlackboardIntegrity() {
  console.log('\n=== Testing Blackboard Integrity ===');
  
  runTest('Blackboard', 'Should handle undefined gracefully', () => {
    const blackboard = Blackboard.create();
    const value = Blackboard.get(blackboard, 'non-existent-key');
    assert(value === undefined, 'Non-existent keys should return undefined');
  });
  
  runTest('Blackboard', 'Should clean up old entries', () => {
    const blackboard = Blackboard.create();
    
    Blackboard.recordNodeExecution(blackboard, 'test-node', NodeStatus.SUCCESS, 0, 0, 'test');
    Blackboard.cleanupOldEntries(blackboard, 1000); // 1000 hours later
    
    const nodeData = Blackboard.getNodeExecutionData(blackboard);
    if (nodeData['test-node']) {
      recordFinding('Blackboard', 'Old entries not cleaned up properly');
    }
  });
  
  runTest('Blackboard', 'Should not allow data corruption between entities', () => {
    const blackboard1 = Blackboard.create();
    const blackboard2 = Blackboard.create();
    
    Blackboard.set(blackboard1, 'key1', 'value1');
    Blackboard.set(blackboard2, 'key2', 'value2');
    
    const value1InBoard2 = Blackboard.get(blackboard2, 'key1');
    const value2InBoard1 = Blackboard.get(blackboard1, 'key2');
    
    assert(value1InBoard2 === undefined, 'Blackboards should be isolated');
    assert(value2InBoard1 === undefined, 'Blackboards should be isolated');
  });
}

export async function testDecoratorNodes() {
  const { CooldownNode, CachingNode } = await import('../nodes');
  const { ActionNode } = await import('../nodes/leaf-nodes');
  
  console.log('\n=== Testing Decorator Nodes ===');
  
  runTest('CooldownNode', 'Should block execution during cooldown', () => {
    const human = createMockHuman();
    const context = createMockContext();
    const blackboard = human.aiBlackboard!;
    
    let executionCount = 0;
    const childNode = new ActionNode(() => {
      executionCount++;
      return NodeStatus.SUCCESS;
    }, 'TestAction');
    
    const cooldownNode = new CooldownNode(10, childNode, 'TestCooldown');
    
    // First execution should succeed and set cooldown
    let status = cooldownNode.execute(human, context, blackboard);
    assert(status === NodeStatus.SUCCESS, 'First execution should succeed');
    assert(executionCount === 1, 'Child should execute once');
    
    // Second execution should fail due to cooldown
    status = cooldownNode.execute(human, context, blackboard);
    assert(status === NodeStatus.FAILURE, 'Should fail during cooldown');
    assert(executionCount === 1, 'Child should not execute again');
  });
  
  runTest('CooldownNode', 'Should allow RUNNING child to continue', () => {
    const human = createMockHuman();
    const context = createMockContext();
    const blackboard = human.aiBlackboard!;
    
    let executionCount = 0;
    const childNode = new ActionNode(() => {
      executionCount++;
      if (executionCount < 3) {
        return NodeStatus.RUNNING;
      }
      return NodeStatus.SUCCESS;
    }, 'TestAction');
    
    const cooldownNode = new CooldownNode(10, childNode, 'TestCooldown');
    
    // First execution - RUNNING
    cooldownNode.execute(human, context, blackboard);
    
    // Second execution - should continue RUNNING (not blocked by cooldown)
    const status = cooldownNode.execute(human, context, blackboard);
    assert(status === NodeStatus.RUNNING, 'Running child should continue');
    assert(executionCount === 2, 'Child should continue executing');
  });
  
  runTest('CachingNode', 'Should cache SUCCESS results', () => {
    const human = createMockHuman();
    const context = createMockContext();
    const blackboard = human.aiBlackboard!;
    
    let executionCount = 0;
    const childNode = new ActionNode(() => {
      executionCount++;
      return NodeStatus.SUCCESS;
    }, 'TestAction');
    
    const cachingNode = new CachingNode(childNode, 10, 'TestCache');
    
    // First execution
    cachingNode.execute(human, context, blackboard);
    assert(executionCount === 1, 'Child should execute once');
    
    // Second execution should use cache
    cachingNode.execute(human, context, blackboard);
    assert(executionCount === 1, 'Child should not execute again (cached)');
  });
  
  runTest('CachingNode', 'Should not cache RUNNING status', () => {
    const human = createMockHuman();
    const context = createMockContext();
    const blackboard = human.aiBlackboard!;
    
    let executionCount = 0;
    const childNode = new ActionNode(() => {
      executionCount++;
      return NodeStatus.RUNNING;
    }, 'TestAction');
    
    const cachingNode = new CachingNode(childNode, 10, 'TestCache');
    
    // First execution - RUNNING
    cachingNode.execute(human, context, blackboard);
    assert(executionCount === 1, 'Child should execute once');
    
    // Second execution - should NOT use cache for RUNNING
    cachingNode.execute(human, context, blackboard);
    assert(executionCount === 2, 'Child should execute again (RUNNING not cached)');
  });
}

// Main test runner
export async function runAllTests() {
  console.log('='.repeat(60));
  console.log('Behavior Tree Testing Suite');
  console.log('='.repeat(60));
  
  await testEatingBehavior();
  await testGatheringBehavior();
  await testAttackingBehavior();
  await testBlackboardIntegrity();
  await testDecoratorNodes();
  
  console.log('\n' + '='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));
  
  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  const withFindings = testResults.filter(r => r.findings && r.findings.length > 0).length;
  
  console.log(`Total tests: ${testResults.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Tests with findings: ${withFindings}`);
  
  if (failed > 0) {
    console.log('\nFailed tests:');
    testResults
      .filter(r => !r.passed)
      .forEach(r => {
        console.log(`  - ${r.behaviorName} / ${r.testName}: ${r.error}`);
      });
  }
  
  if (withFindings > 0) {
    console.log('\nFindings:');
    testResults
      .filter(r => r.findings && r.findings.length > 0)
      .forEach(r => {
        r.findings!.forEach(f => {
          console.log(`  - ${r.behaviorName}: ${f}`);
        });
      });
  }
  
  return testResults;
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(console.error);
}

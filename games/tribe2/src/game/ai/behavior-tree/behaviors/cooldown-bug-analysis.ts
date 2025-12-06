/**
 * Deep Analysis of CooldownNode Behavior
 * 
 * This script tests the CooldownNode implementation to find potential bugs
 * related to how it handles RUNNING status and cooldowns.
 */

import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext, GameWorldState } from '../../../world-types';
import { Blackboard } from '../behavior-tree-blackboard';
import { NodeStatus } from '../behavior-tree-types';
import { CooldownNode } from '../nodes';
import { ActionNode } from '../nodes/leaf-nodes';

function createMockHuman(): HumanEntity {
  const blackboard = Blackboard.create();
  return {
    id: 'test-human',
    type: 'human',
    position: { x: 100, y: 100 },
    aiBlackboard: blackboard,
  } as HumanEntity;
}

function createMockContext(time: number = 0): UpdateContext {
  return {
    deltaTime: 0.1,
    gameState: {
      time,
      mapDimensions: { width: 1000, height: 1000 },
      entities: { entities: {}, entityIndex: {} },
    } as GameWorldState,
  } as UpdateContext;
}

console.log('='.repeat(70));
console.log('COOLDOWN NODE BUG ANALYSIS');
console.log('='.repeat(70));

// --- TEST 1: Cooldown set on RUNNING, but child eventually fails ---
console.log('\n--- TEST 1: Cooldown set on RUNNING, then child fails ---');
console.log('Issue: If a child starts RUNNING, cooldown is set immediately.');
console.log('If the child later fails, the cooldown prevents re-attempting.');

let executionCount = 0;
const childNode1 = new ActionNode(() => {
  executionCount++;
  console.log(`  Execution ${executionCount}`);
  
  if (executionCount === 1) {
    console.log('    -> Child returns RUNNING (cooldown will be set)');
    return NodeStatus.RUNNING;
  } else if (executionCount === 2) {
    console.log('    -> Child returns FAILURE (but cooldown already set!)');
    return NodeStatus.FAILURE;
  }
  
  console.log('    -> Child returns SUCCESS');
  return NodeStatus.SUCCESS;
}, 'TestChild');

const cooldownNode1 = new CooldownNode(10, childNode1, 'TestCooldown');
const human1 = createMockHuman();
const blackboard1 = human1.aiBlackboard!;

console.log('\nExecution 1 (time=0):');
let status = cooldownNode1.execute(human1, createMockContext(0), blackboard1);
console.log(`Result: ${NodeStatus[status]}`);

console.log('\nExecution 2 (time=1):');
status = cooldownNode1.execute(human1, createMockContext(1), blackboard1);
console.log(`Result: ${NodeStatus[status]}`);

console.log('\nExecution 3 (time=2, trying again after FAILURE):');
status = cooldownNode1.execute(human1, createMockContext(2), blackboard1);
console.log(`Result: ${NodeStatus[status]}`);
console.log('Expected: Should allow retry since child failed');
console.log(`Actual: ${status === NodeStatus.FAILURE ? '❌ BLOCKED by cooldown (BUG!)' : '✓ Allowed to retry'}`);

// --- TEST 2: Cooldown logic with RUNNING -> SUCCESS transition ---
console.log('\n\n--- TEST 2: Normal case - RUNNING -> SUCCESS ---');
executionCount = 0;

const childNode2 = new ActionNode(() => {
  executionCount++;
  console.log(`  Execution ${executionCount}`);
  
  if (executionCount < 3) {
    console.log('    -> Child returns RUNNING');
    return NodeStatus.RUNNING;
  }
  
  console.log('    -> Child returns SUCCESS');
  return NodeStatus.SUCCESS;
}, 'TestChild2');

const cooldownNode2 = new CooldownNode(10, childNode2, 'TestCooldown2');
const human2 = createMockHuman();
const blackboard2 = human2.aiBlackboard!;

console.log('\nExecutions while RUNNING:');
cooldownNode2.execute(human2, createMockContext(0), blackboard2);
cooldownNode2.execute(human2, createMockContext(1), blackboard2);

console.log('\nExecution that succeeds (time=2):');
status = cooldownNode2.execute(human2, createMockContext(2), blackboard2);
console.log(`Result: ${NodeStatus[status]}`);

console.log('\nTrying again immediately (time=3):');
status = cooldownNode2.execute(human2, createMockContext(3), blackboard2);
console.log(`Result: ${NodeStatus[status]}`);
console.log(`Expected: FAILURE (cooldown active)`);
console.log(`Actual: ${status === NodeStatus.FAILURE ? '✓ Correctly blocked' : '❌ Not blocked (unexpected)'}`);

// --- TEST 3: Edge case - RUNNING child interrupted by parent selector ---
console.log('\n\n--- TEST 3: RUNNING child that never completes ---');
console.log('Issue: If a RUNNING child is interrupted and never completes,');
console.log('the cooldown remains active indefinitely.');

executionCount = 0;
const childNode3 = new ActionNode(() => {
  executionCount++;
  console.log(`  Execution ${executionCount}: Child always returns RUNNING`);
  return NodeStatus.RUNNING;
}, 'TestChild3');

const cooldownNode3 = new CooldownNode(5, childNode3, 'TestCooldown3');
const human3 = createMockHuman();
const blackboard3 = human3.aiBlackboard!;

console.log('\nExecution 1 (time=0):');
cooldownNode3.execute(human3, createMockContext(0), blackboard3);

console.log('\nNow simulating interruption (parent selector chooses different branch)');
console.log('Manually resetting child lastStatus to simulate fresh evaluation:');
childNode3.setLastStatus(human3, NodeStatus.NOT_EVALUATED);

console.log('\nExecution 2 (time=1, attempting fresh start after interruption):');
status = cooldownNode3.execute(human3, createMockContext(1), blackboard3);
console.log(`Result: ${NodeStatus[status]}`);
console.log('Expected: Might expect RUNNING or should it be blocked?');
console.log(`Actual: ${status === NodeStatus.RUNNING ? '✓ Allowed to continue' : '❌ Blocked (may be a problem)'}`);

// --- SUMMARY ---
console.log('\n' + '='.repeat(70));
console.log('FINDINGS SUMMARY');
console.log('='.repeat(70));

console.log(`
🐛 BUG FOUND: CooldownNode sets cooldown when child starts RUNNING

Location: decorator-nodes.ts, line 390
Code: if (childStatus === NodeStatus.SUCCESS || childStatus === NodeStatus.RUNNING)

Problem:
1. When a child returns RUNNING for the first time, the cooldown is set immediately
2. If the child later fails (after being RUNNING), the cooldown remains active
3. This prevents the behavior from being retried even though it failed
4. This is especially problematic for behaviors that might fail partway through

Suggested Fix:
Only set the cooldown when the child completes successfully (returns SUCCESS).
Do NOT set the cooldown on RUNNING status.

Corrected line 390 should be:
  if (childStatus === NodeStatus.SUCCESS) {
    Blackboard.set(blackboard, this.cooldownKey, currentTime + this.cooldownDurationHours);
  }

Alternatively, if the intention is to prevent frequent retries:
  if (childStatus === NodeStatus.FAILURE) {
    Blackboard.set(blackboard, this.cooldownKey, currentTime + this.cooldownDurationHours);
  }

This would make sense for behaviors that are expensive to evaluate and shouldn't
be retried immediately after failing.
`);

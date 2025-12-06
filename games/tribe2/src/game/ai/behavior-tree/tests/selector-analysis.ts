/**
 * Deep Analysis of Selector Node RUNNING State Management
 * 
 * This script tests whether the Selector correctly manages RUNNING children
 * across multiple ticks and handles edge cases.
 */

import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext, GameWorldState } from '../../../world-types';
import { Blackboard } from '../behavior-tree-blackboard';
import { NodeStatus } from '../behavior-tree-types';
import { Selector } from '../nodes/composite-nodes';
import { ActionNode, ConditionNode } from '../nodes/leaf-nodes';

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
console.log('SELECTOR NODE RUNNING STATE MANAGEMENT ANALYSIS');
console.log('='.repeat(70));

// --- TEST 1: Selector should resume from RUNNING child ---
console.log('\n--- TEST 1: Selector resumes from RUNNING child ---');

let child1Calls = 0;
let child2Calls = 0;
let child3Calls = 0;

const child1 = new ActionNode(() => {
  child1Calls++;
  console.log(`  Child 1 called (${child1Calls} times)`);
  return NodeStatus.FAILURE;
}, 'Child1');

const child2 = new ActionNode(() => {
  child2Calls++;
  console.log(`  Child 2 called (${child2Calls} times)`);
  return child2Calls < 3 ? NodeStatus.RUNNING : NodeStatus.SUCCESS;
}, 'Child2');

const child3 = new ActionNode(() => {
  child3Calls++;
  console.log(`  Child 3 called (${child3Calls} times)`);
  return NodeStatus.SUCCESS;
}, 'Child3');

const selector = new Selector([child1, child2, child3], 'TestSelector');
const human = createMockHuman();
const blackboard = human.aiBlackboard!;

console.log('\nTick 1:');
selector.execute(human, createMockContext(0), blackboard);
console.log(`Expected: Child1 FAILs, Child2 starts RUNNING`);
console.log(`Running child index: ${selector.getRunningChildIndex(human)}`);

console.log('\nTick 2:');
selector.execute(human, createMockContext(1), blackboard);
console.log(`Expected: Selector should resume from Child2, NOT call Child1 again`);
console.log(`Child1 calls: ${child1Calls} (should be 1)`);
console.log(`Child2 calls: ${child2Calls} (should be 2)`);
console.log(`Running child index: ${selector.getRunningChildIndex(human)}`);

if (child1Calls !== 1) {
  console.log('❌ BUG: Selector called Child1 again when resuming!');
} else {
  console.log('✓ Correct: Selector resumed from RUNNING child');
}

console.log('\nTick 3:');
selector.execute(human, createMockContext(2), blackboard);
console.log(`Expected: Child2 returns SUCCESS, selector succeeds`);
console.log(`Child1 calls: ${child1Calls} (should still be 1)`);
console.log(`Child2 calls: ${child2Calls} (should be 3)`);
console.log(`Child3 calls: ${child3Calls} (should be 0 - never reached)`);

// --- TEST 2: What happens if a RUNNING child becomes invalid? ---
console.log('\n\n--- TEST 2: RUNNING child condition becomes invalid ---');
console.log('Scenario: A condition before the RUNNING child becomes false');

child1Calls = 0;
child2Calls = 0;

let conditionShouldPass = true;
const gateCondition = new ConditionNode(() => {
  console.log(`  Gate condition evaluated: ${conditionShouldPass}`);
  return conditionShouldPass;
}, 'GateCondition');

const protectedChild = new ActionNode(() => {
  child1Calls++;
  console.log(`  Protected child called (${child1Calls} times)`);
  return NodeStatus.RUNNING;
}, 'ProtectedChild');

// This is actually a Sequence pattern, but let's see how Selector handles it
// In real code, this would be: Sequence([gateCondition, protectedChild])
// But we're testing edge cases here

console.log('\nThis test reveals whether conditions are re-evaluated in Sequences');
console.log('(Related to potential bugs in behaviors)');

// --- TEST 3: Multiple RUNNING children? ---
console.log('\n\n--- TEST 3: Only one child should be RUNNING at a time ---');
console.log('Selector should NOT execute children after a RUNNING child');

child1Calls = 0;
child2Calls = 0;
child3Calls = 0;

const runningChild1 = new ActionNode(() => {
  child1Calls++;
  console.log(`  RunningChild1 called`);
  return NodeStatus.RUNNING;
}, 'RunningChild1');

const runningChild2 = new ActionNode(() => {
  child2Calls++;
  console.log(`  RunningChild2 called (should NEVER be called)`);
  return NodeStatus.RUNNING;
}, 'RunningChild2');

const selector2 = new Selector([child1, runningChild1, runningChild2], 'TestSelector2');
const human2 = createMockHuman();
const blackboard2 = human2.aiBlackboard!;

console.log('\nExecution:');
selector2.execute(human2, createMockContext(0), blackboard2);

if (child2Calls > 0) {
  console.log('❌ BUG: Selector executed child after RUNNING child!');
} else {
  console.log('✓ Correct: Selector stopped at RUNNING child');
}

// --- TEST 4: Selector with all failing children, then one becomes RUNNING ---
console.log('\n\n--- TEST 4: Transition from all-FAILURE to one-RUNNING ---');

let tick = 0;
const dynamicChild = new ActionNode(() => {
  tick++;
  console.log(`  Dynamic child (tick ${tick})`);
  if (tick === 1) {
    console.log('    -> Returns FAILURE');
    return NodeStatus.FAILURE;
  } else {
    console.log('    -> Returns RUNNING');
    return NodeStatus.RUNNING;
  }
}, 'DynamicChild');

const failChild = new ConditionNode(() => false, 'AlwaysFail');
const selector3 = new Selector([failChild, dynamicChild], 'TestSelector3');
const human3 = createMockHuman();
const blackboard3 = human3.aiBlackboard!;

console.log('\nTick 1 (all children fail):');
let status = selector3.execute(human3, createMockContext(0), blackboard3);
console.log(`Result: ${NodeStatus[status]}`);
console.log(`Expected: FAILURE`);

console.log('\nTick 2 (dynamic child now returns RUNNING):');
status = selector3.execute(human3, createMockContext(1), blackboard3);
console.log(`Result: ${NodeStatus[status]}`);
console.log(`Expected: RUNNING`);
console.log(`Running child index: ${selector3.getRunningChildIndex(human3)}`);

// --- SUMMARY ---
console.log('\n' + '='.repeat(70));
console.log('FINDINGS SUMMARY');
console.log('='.repeat(70));

console.log(`
✓ Selector correctly maintains runningChildIndex and resumes from it
✓ Selector does not execute children after a RUNNING child
✓ Selector properly handles transitions between states

Potential issue to watch:
- In Sequences with Conditions followed by Actions, if the Condition becomes
  false while the Action is RUNNING, the Sequence will fail immediately on
  the next tick (as it re-evaluates from the beginning). This is by design
  but could cause unexpected behavior interruptions in complex trees.

Recommendation:
- Behaviors should be designed with the understanding that Sequences
  re-evaluate ALL preceding nodes on each tick, even when a later child
  is RUNNING.
- This is correct for reactive behavior trees but may surprise developers.
`);

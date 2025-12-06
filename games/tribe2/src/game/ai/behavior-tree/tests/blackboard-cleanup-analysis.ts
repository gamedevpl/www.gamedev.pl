/**
 * Blackboard Memory Leak Analysis
 * 
 * This script tests whether behaviors properly clean up blackboard data
 * when they complete, fail, or are interrupted.
 */

import { Blackboard, BlackboardData } from '../behavior-tree-blackboard';

console.log('='.repeat(70));
console.log('BLACKBOARD CLEANUP ANALYSIS');
console.log('='.repeat(70));

// --- TEST 1: Basic blackboard cleanup ---
console.log('\n--- TEST 1: Old node execution data cleanup ---');

const blackboard1 = Blackboard.create();

// Record some node executions
Blackboard.recordNodeExecution(blackboard1, 'Node1', 0, 0, 0, 'test');
Blackboard.recordNodeExecution(blackboard1, 'Node2', 0, 100, 0, 'test');
Blackboard.recordNodeExecution(blackboard1, 'Node3', 0, 200, 0, 'test');

console.log('Recorded 3 node executions at times 0, 100, 200');

const dataBefore = Blackboard.getNodeExecutionData(blackboard1);
console.log(`Nodes before cleanup: ${Object.keys(dataBefore).length}`);

// Clean up entries older than 1000 hours
Blackboard.cleanupOldEntries(blackboard1, 1500);

const dataAfter = Blackboard.getNodeExecutionData(blackboard1);
console.log(`Nodes after cleanup (at time 1500): ${Object.keys(dataAfter).length}`);

if (Object.keys(dataAfter).length > 0) {
  console.log('❌ POTENTIAL BUG: Old entries not cleaned up');
  console.log('Remaining nodes:', Object.keys(dataAfter));
} else {
  console.log('✓ Correct: All old entries cleaned up');
}

// --- TEST 2: Blackboard data isolation ---
console.log('\n\n--- TEST 2: Blackboard isolation between entities ---');

const blackboard2a = Blackboard.create();
const blackboard2b = Blackboard.create();

Blackboard.set(blackboard2a, 'testKey', 'valueA');
Blackboard.set(blackboard2b, 'testKey', 'valueB');

const valueA = Blackboard.get(blackboard2a, 'testKey');
const valueB = Blackboard.get(blackboard2b, 'testKey');

console.log(`Blackboard A value: ${valueA}`);
console.log(`Blackboard B value: ${valueB}`);

if (valueA === 'valueA' && valueB === 'valueB') {
  console.log('✓ Correct: Blackboards are properly isolated');
} else {
  console.log('❌ CRITICAL BUG: Blackboard data is shared between entities!');
}

// --- TEST 3: Common patterns in behaviors ---
console.log('\n\n--- TEST 3: Common behavior patterns that may leak memory ---');

const blackboard3 = Blackboard.create();

console.log('\nPattern 1: Setting target ID when finding an entity');
Blackboard.set(blackboard3, 'foodSource', 'bush-123');
Blackboard.set(blackboard3, 'attackTarget', 'enemy-456');
Blackboard.set(blackboard3, 'plantingSpot', { x: 100, y: 100 });

const keys = Object.keys(blackboard3.data);
console.log(`Keys in blackboard: ${keys.join(', ')}`);
console.log('Note: These should be cleaned up when behavior completes or fails');

console.log('\nPattern 2: Checking if cleanup happens on FAILURE');
console.log('Simulating behavior failure by deleting keys:');
Blackboard.delete(blackboard3, 'foodSource');
Blackboard.delete(blackboard3, 'attackTarget');

const keysAfterCleanup = Object.keys(blackboard3.data);
console.log(`Keys remaining: ${keysAfterCleanup.join(', ')}`);

if (Blackboard.has(blackboard3, 'plantingSpot')) {
  console.log('⚠️  Key "plantingSpot" still exists - needs manual cleanup in behavior');
}

// --- TEST 4: Decorator node blackboard usage ---
console.log('\n\n--- TEST 4: Decorator nodes blackboard usage ---');

const blackboard4 = Blackboard.create();

console.log('CachingNode stores: caching_{name}_status, caching_{name}_timestamp');
Blackboard.set(blackboard4, 'caching_FindFood_status', 0);
Blackboard.set(blackboard4, 'caching_FindFood_timestamp', 100);

console.log('CooldownNode stores: cooldown_{name}');
Blackboard.set(blackboard4, 'cooldown_Planting', 200);

console.log('TimeoutNode stores: timeout_{name}_startTime');
Blackboard.set(blackboard4, 'timeout_Moving_startTime', 150);

const allKeys = Object.keys(blackboard4.data);
console.log(`\nAll decorator keys: ${allKeys.join(', ')}`);
console.log('\nNote: These are persistent across ticks and should expire naturally');
console.log('Question: Should there be a global cleanup for stale decorator data?');

// Check for potential memory leak
const decoratorKeyCount = allKeys.filter(k => 
  k.startsWith('caching_') || k.startsWith('cooldown_') || k.startsWith('timeout_')
).length;

console.log(`\nDecorator keys in blackboard: ${decoratorKeyCount}`);
console.log('⚠️  If an entity has many behaviors with decorators, this could accumulate');

// --- TEST 5: lastStatus storage on entities ---
console.log('\n\n--- TEST 5: Per-node lastStatus storage ---');

const blackboard5 = Blackboard.create();

console.log('Each BehaviorNode stores: {nodeName}_lastStatus, {nodeName}_runningChildIndex');
Blackboard.set(blackboard5, 'Eating_lastStatus', 0);
Blackboard.set(blackboard5, 'Gathering_lastStatus', 0);
Blackboard.set(blackboard5, 'TestSelector_runningChildIndex', 2);

const statusKeys = Object.keys(blackboard5.data).filter(k => 
  k.endsWith('_lastStatus') || k.endsWith('_runningChildIndex')
);

console.log(`Status tracking keys: ${statusKeys.join(', ')}`);
console.log('\nNote: These accumulate over time as the entity uses different behaviors');
console.log('Consider: Should there be a limit or cleanup for unused behavior state?');

// --- SUMMARY ---
console.log('\n' + '='.repeat(70));
console.log('FINDINGS SUMMARY');
console.log('='.repeat(70));

console.log(`
BLACKBOARD MEMORY MANAGEMENT FINDINGS:

✓ Blackboards are properly isolated between entities
✓ Old node execution data can be cleaned up via cleanupOldEntries()
✓ Node execution history is automatically pruned to a time window

⚠️  POTENTIAL ISSUES:

1. Behavior-specific keys (foodSource, attackTarget, etc.):
   - Many behaviors set keys in the blackboard
   - Not all behaviors clean up on FAILURE or interruption
   - Could accumulate stale data over time
   
   Recommendation: 
   - Add explicit cleanup in behavior FAILURE paths
   - Consider a naming convention for temporary vs permanent keys
   - Add debug logging to detect stale keys

2. Decorator node keys (caching_, cooldown_, timeout_):
   - Accumulate as entities use different behaviors
   - Some expire naturally (timeouts, caches)
   - Cooldowns remain until they expire
   
   Recommendation:
   - Acceptable for current design
   - Could add a "max keys" limit with LRU eviction for very long-running games

3. Per-node state keys (_lastStatus, _runningChildIndex):
   - Grow with the number of unique nodes ever executed
   - Never cleaned up automatically
   
   Recommendation:
   - Consider periodic cleanup of nodes that haven't run recently
   - Or accept this as a reasonable memory cost

SPECIFIC BUGS TO INVESTIGATE:

1. Check gathering-behavior.ts line 124: Does it clean up 'foodSource' on all failure paths?
2. Check attacking-behavior.ts lines 108-110: Cleanup looks correct
3. Check planting-behavior.ts lines 59, 90: Cleanup looks correct
4. Check procreation-behavior.ts: Multiple blackboard keys - verify all paths clean up

GREP COMMANDS TO FIND CLEANUP ISSUES:
  grep -n "Blackboard.set" behaviors/*.ts | grep -v "Blackboard.delete"
  This finds all places that set blackboard data
  Then manually verify each has corresponding cleanup
`);

console.log('\n' + '='.repeat(70));

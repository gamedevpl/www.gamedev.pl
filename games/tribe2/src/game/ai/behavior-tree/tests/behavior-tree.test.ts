import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Selector, Sequence } from './nodes/composite-nodes';
import { NodeStatus } from './behavior-tree-types';
import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { Blackboard, BlackboardData } from './behavior-tree-blackboard';
import { ActionNode, ConditionNode } from './nodes/leaf-nodes';
import { GameWorldState } from '../../world-types';
import { CachingNode, TimeoutNode } from './nodes';
import { CharacterEntity } from '../../entities/characters/character-types';

// --- Mocks and Helpers ---
let mockHuman: HumanEntity;
const mockContext = {
  deltaTime: 1,
  gameState: {
    time: 0,
  } as GameWorldState,
} as UpdateContext;

const advanceTime = (hours: number) => {
  mockContext.gameState.time += hours;
};

const TestBlackboard = { ...Blackboard };
TestBlackboard.recordNodeExecution = vi.fn();

let blackboard: BlackboardData;

beforeEach(() => {
  blackboard = TestBlackboard.create();
  mockContext.gameState.time = 0;
  mockHuman = { aiBlackboard: blackboard } as HumanEntity;
});

const createSuccessNode = (name = 'SuccessNode') => new ConditionNode(() => true, name);
const createFailureNode = (name = 'FailureNode') => new ConditionNode(() => false, name);

// A controllable node that can be set to return RUNNING then SUCCESS
class ControllableActionNode<T extends CharacterEntity> extends ActionNode<T> {
  runCount = 0;
  maxRuns: number;
  statusOnRun: NodeStatus;
  statusAfterMax: NodeStatus;

  constructor(
    maxRuns = 1,
    statusOnRun = NodeStatus.RUNNING,
    statusAfterMax = NodeStatus.SUCCESS,
    name = 'ControllableActionNode',
  ) {
    super(() => this.executeLogic(), name);
    this.maxRuns = maxRuns;
    this.statusOnRun = statusOnRun;
    this.statusAfterMax = statusAfterMax;
  }

  executeLogic(): NodeStatus {
    this.runCount++;
    if (this.runCount > this.maxRuns) {
      return this.statusAfterMax;
    }
    return this.statusOnRun;
  }

  reset() {
    this.runCount = 0;
  }
}

describe('Behavior Tree Composite Nodes', () => {
  describe('Selector Node', () => {
    it('should return SUCCESS if the first child succeeds', () => {
      const selector = new Selector([createSuccessNode(), createFailureNode()]);
      const status = selector.execute(mockHuman, mockContext, blackboard);
      expect(status).toBe(NodeStatus.SUCCESS);
    });

    it('should return SUCCESS if a later child succeeds', () => {
      const selector = new Selector([
        createFailureNode('Fail1'),
        createSuccessNode('Success1'),
        createFailureNode('Fail2'),
      ]);
      const status = selector.execute(mockHuman, mockContext, blackboard);
      expect(status).toBe(NodeStatus.SUCCESS);
    });

    it('should return FAILURE if all children fail', () => {
      const selector = new Selector([createFailureNode('Fail1'), createFailureNode('Fail2')]);
      const status = selector.execute(mockHuman, mockContext, blackboard);
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should return RUNNING and set runningChildIndex when a child is running', () => {
      const runningNode = new ControllableActionNode(1);
      const selector = new Selector([createFailureNode(), runningNode, createSuccessNode()]);

      const status = selector.execute(mockHuman, mockContext, blackboard);

      expect(status).toBe(NodeStatus.RUNNING);
      expect(selector.getRunningChildIndex(mockHuman)).toBe(1);
    });

    it('should resume execution from the running child on the next tick', () => {
      const runningNode = new ControllableActionNode(1);
      const successNode = createSuccessNode('ShouldNotRun');
      const selector = new Selector([createFailureNode(), runningNode, successNode]);

      // First tick: node starts running
      let status = selector.execute(mockHuman, mockContext, blackboard);
      expect(status).toBe(NodeStatus.RUNNING);
      expect(selector.getRunningChildIndex(mockHuman)).toBe(1);
      expect(runningNode.runCount).toBe(1);

      // Second tick: node finishes
      status = selector.execute(mockHuman, mockContext, blackboard);
      expect(status).toBe(NodeStatus.SUCCESS);
      expect(selector.getRunningChildIndex(mockHuman)).toBeUndefined();
      expect(runningNode.runCount).toBe(2);
    });
  });

  describe('Sequence Node', () => {
    it('should return SUCCESS if all children succeed', () => {
      const sequence = new Sequence([createSuccessNode('Success1'), createSuccessNode('Success2')]);
      const status = sequence.execute(mockHuman, mockContext, blackboard);
      expect(status).toBe(NodeStatus.SUCCESS);
    });

    it('should return FAILURE if the first child fails', () => {
      const sequence = new Sequence([createFailureNode(), createSuccessNode('ShouldNotRun')]);
      const status = sequence.execute(mockHuman, mockContext, blackboard);
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should return FAILURE if a later child fails', () => {
      const sequence = new Sequence([createSuccessNode(), createFailureNode(), createSuccessNode('ShouldNotRun')]);
      const status = sequence.execute(mockHuman, mockContext, blackboard);
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should return RUNNING when a child is running', () => {
      const runningNode = new ControllableActionNode(1);
      const sequence = new Sequence([createSuccessNode(), runningNode, createSuccessNode('ShouldNotRun')]);

      const status = sequence.execute(mockHuman, mockContext, blackboard);

      expect(status).toBe(NodeStatus.RUNNING);
    });

    it('should resume from the beginning when a child was running', () => {
      const runningNode = new ControllableActionNode(1);
      const firstNode = createSuccessNode('First');
      const sequence = new Sequence([firstNode, runningNode, createSuccessNode('Last')]);

      const firstNodeSpy = vi.spyOn(firstNode, 'execute');

      // First tick: node starts running
      let status = sequence.execute(mockHuman, mockContext, blackboard);
      expect(status).toBe(NodeStatus.RUNNING);
      expect(runningNode.runCount).toBe(1);
      expect(firstNodeSpy).toHaveBeenCalledTimes(1);

      // Second tick: resumes, re-evaluates first node, then finishes running node
      status = sequence.execute(mockHuman, mockContext, blackboard);
      expect(status).toBe(NodeStatus.SUCCESS);
      expect(runningNode.runCount).toBe(2);
      // Crucially, the first node was executed again
      expect(firstNodeSpy).toHaveBeenCalledTimes(2);
    });

    it('should fail if a preceding node fails on a resume tick', () => {
      let firstNodeSucceeds = true;
      const firstNode = new ConditionNode(() => firstNodeSucceeds, 'ControllableFirstNode');
      const runningNode = new ControllableActionNode(2);
      const sequence = new Sequence([firstNode, runningNode]);

      const firstNodeSpy = vi.spyOn(firstNode, 'execute');
      const runningNodeSpy = vi.spyOn(runningNode, 'execute');

      // First tick: everything is fine, second node is running
      let status = sequence.execute(mockHuman, mockContext, blackboard);
      expect(status).toBe(NodeStatus.RUNNING);
      expect(firstNodeSpy).toHaveBeenCalledTimes(1);
      expect(runningNodeSpy).toHaveBeenCalledTimes(1);

      // Before second tick, make the first node fail
      firstNodeSucceeds = false;

      // Second tick: sequence should fail immediately when re-evaluating first node
      status = sequence.execute(mockHuman, mockContext, blackboard);
      expect(status).toBe(NodeStatus.FAILURE);
      expect(firstNodeSpy).toHaveBeenCalledTimes(2); // First node was re-evaluated
      expect(runningNodeSpy).toHaveBeenCalledTimes(1); // Running node was NOT executed again
    });
  });

  describe('Nested Behavior Tree Scenarios', () => {
    it('should correctly handle a RUNNING status in a 3-level nested tree', () => {
      // Level 3 (innermost)
      const runningAction = new ControllableActionNode(2, NodeStatus.RUNNING, NodeStatus.SUCCESS, 'RunningAction'); // Runs for 2 ticks

      // Level 2
      const innerSequence = new Sequence(
        [createSuccessNode('ConditionA'), runningAction, createSuccessNode('ActionB')],
        'InnerSequence',
      );

      // Level 1 (Root)
      const rootSelector = new Selector(
        [createFailureNode('Branch1'), innerSequence, createSuccessNode('Branch3')],
        'RootSelector',
      );

      const conditionASpy = vi.spyOn(innerSequence.children[0], 'execute');
      const runningActionSpy = vi.spyOn(runningAction, 'execute');
      const actionBSpy = vi.spyOn(innerSequence.children[2], 'execute');

      // --- Tick 1 ---
      // Expect: RootSelector -> RUNNING, InnerSequence -> RUNNING, RunningAction -> RUNNING
      let status = rootSelector.execute(mockHuman, mockContext, blackboard);
      expect(status).toBe(NodeStatus.RUNNING);
      expect(rootSelector.getRunningChildIndex(mockHuman)).toBe(1); // innerSequence is running
      expect(conditionASpy).toHaveBeenCalledTimes(1);
      expect(runningActionSpy).toHaveBeenCalledTimes(1);
      expect(actionBSpy).not.toHaveBeenCalled(); // Not yet reached

      // --- Tick 2 ---
      // Expect: Still running. Selector resumes from innerSequence. Sequence restarts.
      status = rootSelector.execute(mockHuman, mockContext, blackboard);
      expect(status).toBe(NodeStatus.RUNNING);
      expect(rootSelector.getRunningChildIndex(mockHuman)).toBe(1);
      // Sequence re-evaluates preceding nodes
      expect(conditionASpy).toHaveBeenCalledTimes(2);
      expect(runningActionSpy).toHaveBeenCalledTimes(2);
      expect(actionBSpy).not.toHaveBeenCalled();

      // --- Tick 3 ---
      // Expect: runningAction succeeds, so the whole sequence and selector succeed.
      status = rootSelector.execute(mockHuman, mockContext, blackboard);
      expect(status).toBe(NodeStatus.SUCCESS);
      expect(rootSelector.getRunningChildIndex(mockHuman)).toBeUndefined();
      expect(conditionASpy).toHaveBeenCalledTimes(3);
      expect(runningActionSpy).toHaveBeenCalledTimes(3); // Final call returns SUCCESS
      expect(actionBSpy).toHaveBeenCalledTimes(1); // Now this is executed
    });
  });
});

describe('Decorator Nodes', () => {
  describe('CachingNode', () => {
    const CACHE_DURATION = 10; // hours
    let childNode: ControllableActionNode<HumanEntity>;
    let cachingNode: CachingNode<HumanEntity>;

    beforeEach(() => {
      childNode = new ControllableActionNode(0, NodeStatus.SUCCESS, NodeStatus.SUCCESS, 'Child');
      cachingNode = new CachingNode(childNode, CACHE_DURATION, 'TestCache');
    });

    it('should execute the child on first run (cache miss)', () => {
      const childSpy = vi.spyOn(childNode, 'execute');
      const status = cachingNode.execute(mockHuman, mockContext, blackboard);
      expect(status).toBe(NodeStatus.SUCCESS);
      expect(childSpy).toHaveBeenCalledTimes(1);
    });

    it('should return cached SUCCESS on second run (cache hit)', () => {
      const childSpy = vi.spyOn(childNode, 'execute');
      cachingNode.execute(mockHuman, mockContext, blackboard); // First run
      const status = cachingNode.execute(mockHuman, mockContext, blackboard); // Second run
      expect(status).toBe(NodeStatus.SUCCESS);
      expect(childSpy).toHaveBeenCalledTimes(1); // Should not be called again
    });

    it('should return cached FAILURE on second run (cache hit)', () => {
      childNode = new ControllableActionNode(0, NodeStatus.FAILURE, NodeStatus.FAILURE, 'Child');
      cachingNode = new CachingNode(childNode, CACHE_DURATION, 'TestCache');
      const childSpy = vi.spyOn(childNode, 'execute');

      cachingNode.execute(mockHuman, mockContext, blackboard); // First run
      const status = cachingNode.execute(mockHuman, mockContext, blackboard); // Second run

      expect(status).toBe(NodeStatus.FAILURE);
      expect(childSpy).toHaveBeenCalledTimes(1); // Should not be called again
    });

    it('should NOT cache the RUNNING status', () => {
      childNode = new ControllableActionNode(1, NodeStatus.RUNNING, NodeStatus.SUCCESS, 'Child');
      cachingNode = new CachingNode(childNode, CACHE_DURATION, 'TestCache');
      const childSpy = vi.spyOn(childNode, 'execute');

      let status = cachingNode.execute(mockHuman, mockContext, blackboard); // First run
      expect(status).toBe(NodeStatus.RUNNING);
      expect(childSpy).toHaveBeenCalledTimes(1);

      status = cachingNode.execute(mockHuman, mockContext, blackboard); // Second run
      expect(status).toBe(NodeStatus.SUCCESS);
      expect(childSpy).toHaveBeenCalledTimes(2); // Should be called again
    });

    it('should re-execute the child after cache duration expires', () => {
      const childSpy = vi.spyOn(childNode, 'execute');
      cachingNode.execute(mockHuman, mockContext, blackboard); // First run, caches the result

      advanceTime(CACHE_DURATION + 1); // Advance time past expiration

      const status = cachingNode.execute(mockHuman, mockContext, blackboard); // Should be a cache miss
      expect(status).toBe(NodeStatus.SUCCESS);
      expect(childSpy).toHaveBeenCalledTimes(2); // Should be called again
    });

    it('should re-execute if validityCheck returns false', () => {
      let isStillValid = true;
      const validityCheck = vi.fn(() => isStillValid);
      cachingNode = new CachingNode(childNode, CACHE_DURATION, 'TestCache', 0, validityCheck);
      const childSpy = vi.spyOn(childNode, 'execute');

      cachingNode.execute(mockHuman, mockContext, blackboard); // First run, caches
      expect(childSpy).toHaveBeenCalledTimes(1);
      expect(validityCheck).not.toHaveBeenCalled(); // Not called on miss

      cachingNode.execute(mockHuman, mockContext, blackboard); // Second run, cache hit
      expect(childSpy).toHaveBeenCalledTimes(1);
      expect(validityCheck).toHaveBeenCalledTimes(1);

      isStillValid = false; // Invalidate the cache

      cachingNode.execute(mockHuman, mockContext, blackboard); // Third run, should miss
      expect(childSpy).toHaveBeenCalledTimes(2);
      expect(validityCheck).toHaveBeenCalledTimes(2);
    });
  });

  describe('TimeoutNode', () => {
    const TIMEOUT_DURATION = 5; // hours
    let childNode: ControllableActionNode<HumanEntity>;
    let timeoutNode: TimeoutNode<HumanEntity>;

    beforeEach(() => {
      // This child will run for 2 ticks, then succeed
      childNode = new ControllableActionNode(2, NodeStatus.RUNNING, NodeStatus.SUCCESS, 'Child');
      timeoutNode = new TimeoutNode(childNode, TIMEOUT_DURATION, 'TestTimeout');
    });

    it('should return SUCCESS if child succeeds before timeout', () => {
      let status;
      status = timeoutNode.execute(mockHuman, mockContext, blackboard); // Tick 1: RUNNING
      expect(status).toBe(NodeStatus.RUNNING);
      advanceTime(1);
      status = timeoutNode.execute(mockHuman, mockContext, blackboard); // Tick 2: RUNNING
      expect(status).toBe(NodeStatus.RUNNING);
      advanceTime(1);
      status = timeoutNode.execute(mockHuman, mockContext, blackboard); // Tick 3: SUCCESS
      expect(status).toBe(NodeStatus.SUCCESS);
    });

    it('should return FAILURE if child is still RUNNING after timeout', () => {
      let status;
      status = timeoutNode.execute(mockHuman, mockContext, blackboard); // Tick 1: RUNNING
      expect(status).toBe(NodeStatus.RUNNING);

      advanceTime(TIMEOUT_DURATION + 1); // Exceed timeout

      status = timeoutNode.execute(mockHuman, mockContext, blackboard); // Tick 2: Should fail
      expect(status).toBe(NodeStatus.FAILURE);
    });

    it('should return RUNNING as long as child is running within the time limit', () => {
      let status;
      status = timeoutNode.execute(mockHuman, mockContext, blackboard); // Tick 1
      expect(status).toBe(NodeStatus.RUNNING);

      advanceTime(TIMEOUT_DURATION - 1); // Get close to timeout

      status = timeoutNode.execute(mockHuman, mockContext, blackboard); // Tick 2
      expect(status).toBe(NodeStatus.RUNNING);
    });

    it('should clear the timer from blackboard on SUCCESS', () => {
      const timerKey = `timeout_${timeoutNode.name}_startTime`;
      timeoutNode.execute(mockHuman, mockContext, blackboard); // Enters RUNNING, sets timer
      expect(TestBlackboard.get(blackboard, timerKey)).toBeDefined();

      timeoutNode.execute(mockHuman, mockContext, blackboard); // Still RUNNING
      timeoutNode.execute(mockHuman, mockContext, blackboard); // SUCCEEDS

      expect(TestBlackboard.get(blackboard, timerKey)).toBeUndefined();
    });

    it('should clear the timer from blackboard on FAILURE', () => {
      const timerKey = `timeout_${timeoutNode.name}_startTime`;
      // This child will run for 1 tick, then fail
      childNode = new ControllableActionNode(1, NodeStatus.RUNNING, NodeStatus.FAILURE, 'Child');
      timeoutNode = new TimeoutNode(childNode, TIMEOUT_DURATION, 'TestTimeout');

      timeoutNode.execute(mockHuman, mockContext, blackboard); // Enters RUNNING, sets timer
      expect(TestBlackboard.get(blackboard, timerKey)).toBeDefined();

      timeoutNode.execute(mockHuman, mockContext, blackboard); // FAILS
      expect(TestBlackboard.get(blackboard, timerKey)).toBeUndefined();
    });

    it('should clear the timer from blackboard on TIMEOUT', () => {
      const timerKey = `timeout_${timeoutNode.name}_startTime`;
      timeoutNode.execute(mockHuman, mockContext, blackboard); // Enters RUNNING, sets timer
      expect(TestBlackboard.get(blackboard, timerKey)).toBeDefined();

      advanceTime(TIMEOUT_DURATION + 1);
      timeoutNode.execute(mockHuman, mockContext, blackboard); // Times out
      expect(TestBlackboard.get(blackboard, timerKey)).toBeUndefined();
    });
  });
});

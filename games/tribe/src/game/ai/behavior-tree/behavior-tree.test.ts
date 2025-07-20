import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Selector, Sequence } from './nodes/composite-nodes';
import { NodeStatus } from './behavior-tree-types';
import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { Blackboard } from './behavior-tree-blackboard';
import { ActionNode, ConditionNode } from './nodes/leaf-nodes';
import { GameWorldState } from '../../world-types';

// --- Mocks and Helpers ---

const mockHuman = {} as HumanEntity;
const mockContext = {
  deltaTime: 1,
  gameState: {
    time: 0,
  } as GameWorldState,
} as UpdateContext;

class TestBlackboard extends Blackboard {
  constructor() {
    super();
    this.recordNodeExecution = vi.fn();
  }
}

let blackboard: TestBlackboard;

beforeEach(() => {
  blackboard = new TestBlackboard();
});

const createSuccessNode = (name = 'SuccessNode') => new ConditionNode(() => true, name);
const createFailureNode = (name = 'FailureNode') => new ConditionNode(() => false, name);

// A controllable node that can be set to return RUNNING then SUCCESS
class ControllableActionNode extends ActionNode {
  runCount = 0;
  maxRuns: number;

  constructor(maxRuns = 1, name = 'ControllableRunningNode') {
    super(() => this.executeLogic(), name);
    this.maxRuns = maxRuns;
  }

  executeLogic(): NodeStatus {
    this.runCount++;
    if (this.runCount > this.maxRuns) {
      return NodeStatus.SUCCESS;
    }
    return NodeStatus.RUNNING;
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
      expect(selector.runningChildIndex).toBe(1);
    });

    it('should resume execution from the running child on the next tick', () => {
      const runningNode = new ControllableActionNode(1);
      const successNode = createSuccessNode('ShouldNotRun');
      const selector = new Selector([createFailureNode(), runningNode, successNode]);

      // First tick: node starts running
      let status = selector.execute(mockHuman, mockContext, blackboard);
      expect(status).toBe(NodeStatus.RUNNING);
      expect(selector.runningChildIndex).toBe(1);
      expect(runningNode.runCount).toBe(1);

      // Second tick: node finishes
      status = selector.execute(mockHuman, mockContext, blackboard);
      expect(status).toBe(NodeStatus.SUCCESS);
      expect(selector.runningChildIndex).toBeUndefined();
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

    it('should return RUNNING and set runningChildIndex when a child is running', () => {
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
      const runningAction = new ControllableActionNode(2, 'RunningAction'); // Runs for 2 ticks

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
      expect(rootSelector.runningChildIndex).toBe(1); // innerSequence is running
      expect(conditionASpy).toHaveBeenCalledTimes(1);
      expect(runningActionSpy).toHaveBeenCalledTimes(1);
      expect(actionBSpy).not.toHaveBeenCalled(); // Not yet reached

      // --- Tick 2 ---
      // Expect: Still running. Selector resumes from innerSequence. Sequence restarts.
      status = rootSelector.execute(mockHuman, mockContext, blackboard);
      expect(status).toBe(NodeStatus.RUNNING);
      expect(rootSelector.runningChildIndex).toBe(1);
      // Sequence re-evaluates preceding nodes
      expect(conditionASpy).toHaveBeenCalledTimes(2);
      expect(runningActionSpy).toHaveBeenCalledTimes(2);
      expect(actionBSpy).not.toHaveBeenCalled();

      // --- Tick 3 ---
      // Expect: runningAction succeeds, so the whole sequence and selector succeed.
      status = rootSelector.execute(mockHuman, mockContext, blackboard);
      expect(status).toBe(NodeStatus.SUCCESS);
      expect(rootSelector.runningChildIndex).toBeUndefined();
      expect(conditionASpy).toHaveBeenCalledTimes(3);
      expect(runningActionSpy).toHaveBeenCalledTimes(3); // Final call returns SUCCESS
      expect(actionBSpy).toHaveBeenCalledTimes(1); // Now this is executed
    });
  });
});

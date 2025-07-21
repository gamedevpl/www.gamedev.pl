
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

    it('should handle a complex 4-level tree with mixed selectors and sequences', () => {
      // Level 4 (Deepest)
      const deepAction = new ControllableActionNode(2, 'DeepRunningAction'); // Runs for 2 ticks

      // Level 3
      const innerSequence = new Sequence(
        [createSuccessNode('ConditionB2'), deepAction, createSuccessNode('ConditionB3')],
        'InnerSequence',
      );

      // Level 2
      const branchA = new Sequence([createFailureNode('ConditionA1'), createSuccessNode('ActionA2')], 'BranchA');
      const branchB = new Sequence(
        [createSuccessNode('ConditionB1'), innerSequence, createSuccessNode('ActionB4')],
        'BranchB',
      );
      const middleSelector = new Selector([branchA, branchB], 'MiddleSelector');

      // Level 1 (Root)
      const rootSequence = new Sequence(
        [createSuccessNode('Condition1'), middleSelector, createSuccessNode('FinalAction')],
        'RootSequence',
      );

      // Spies to track execution
      const condition1Spy = vi.spyOn(rootSequence.children[0], 'execute');
      const finalActionSpy = vi.spyOn(rootSequence.children[2], 'execute');
      const conditionA1Spy = vi.spyOn(branchA.children[0], 'execute');
      const actionA2Spy = vi.spyOn(branchA.children[1], 'execute');
      const conditionB1Spy = vi.spyOn(branchB.children[0], 'execute');
      const conditionB2Spy = vi.spyOn(innerSequence.children[0], 'execute');
      const conditionB3Spy = vi.spyOn(innerSequence.children[2], 'execute');
      const actionB4Spy = vi.spyOn(branchB.children[2], 'execute');
      const deepActionSpy = vi.spyOn(deepAction, 'execute');

      // --- Tick 1 ---
      // Root -> MiddleSelector -> BranchB -> InnerSequence -> DeepAction returns RUNNING
      let status = rootSequence.execute(mockHuman, mockContext, blackboard);
      expect(status, 'Tick 1 Status').toBe(NodeStatus.RUNNING);
      expect(middleSelector.runningChildIndex, 'Tick 1 MiddleSelector runningChildIndex').toBe(1); // Branch B is running
      expect(deepAction.runCount, 'Tick 1 deepAction runCount').toBe(1);

      // Verify execution paths for Tick 1
      expect(condition1Spy, 'Tick 1 condition1Spy').toHaveBeenCalledTimes(1);
      expect(conditionA1Spy, 'Tick 1 conditionA1Spy').toHaveBeenCalledTimes(1);
      expect(actionA2Spy, 'Tick 1 actionA2Spy').not.toHaveBeenCalled(); // Branch A failed
      expect(conditionB1Spy, 'Tick 1 conditionB1Spy').toHaveBeenCalledTimes(1);
      expect(conditionB2Spy, 'Tick 1 conditionB2Spy').toHaveBeenCalledTimes(1);
      expect(deepActionSpy, 'Tick 1 deepActionSpy').toHaveBeenCalledTimes(1);
      expect(conditionB3Spy, 'Tick 1 conditionB3Spy').not.toHaveBeenCalled(); // Halted by RUNNING
      expect(actionB4Spy, 'Tick 1 actionB4Spy').not.toHaveBeenCalled(); // Halted by RUNNING
      expect(finalActionSpy, 'Tick 1 finalActionSpy').not.toHaveBeenCalled(); // Halted by RUNNING

      // --- Tick 2 ---
      // Root re-evaluates, MiddleSelector resumes from BranchB, InnerSequence re-evaluates, DeepAction returns RUNNING again
      status = rootSequence.execute(mockHuman, mockContext, blackboard);
      expect(status, 'Tick 2 Status').toBe(NodeStatus.RUNNING);
      expect(middleSelector.runningChildIndex, 'Tick 2 MiddleSelector runningChildIndex').toBe(1);
      expect(deepAction.runCount, 'Tick 2 deepAction runCount').toBe(2);

      // Verify execution paths for Tick 2
      expect(condition1Spy, 'Tick 2 condition1Spy').toHaveBeenCalledTimes(2); // Sequence re-eval
      expect(conditionA1Spy, 'Tick 2 conditionA1Spy').toHaveBeenCalledTimes(1); // Not re-evaluated, selector resumes
      expect(actionA2Spy, 'Tick 2 actionA2Spy').not.toHaveBeenCalled();
      expect(conditionB1Spy, 'Tick 2 conditionB1Spy').toHaveBeenCalledTimes(2); // Sequence re-eval
      expect(conditionB2Spy, 'Tick 2 conditionB2Spy').toHaveBeenCalledTimes(2); // Sequence re-eval
      expect(deepActionSpy, 'Tick 2 deepActionSpy').toHaveBeenCalledTimes(2);
      expect(conditionB3Spy, 'Tick 2 conditionB3Spy').not.toHaveBeenCalled();
      expect(actionB4Spy, 'Tick 2 actionB4Spy').not.toHaveBeenCalled();
      expect(finalActionSpy, 'Tick 2 finalActionSpy').not.toHaveBeenCalled();

      // --- Tick 3 ---
      // DeepAction returns SUCCESS, everything else unfolds to SUCCESS
      status = rootSequence.execute(mockHuman, mockContext, blackboard);
      expect(status, 'Tick 3 Status').toBe(NodeStatus.SUCCESS);
      expect(middleSelector.runningChildIndex, 'Tick 3 MiddleSelector runningChildIndex').toBeUndefined();
      expect(deepAction.runCount, 'Tick 3 deepAction runCount').toBe(3);

      // Verify execution paths for Tick 3
      expect(condition1Spy, 'Tick 3 condition1Spy').toHaveBeenCalledTimes(3);
      expect(conditionA1Spy, 'Tick 3 conditionA1Spy').toHaveBeenCalledTimes(1);
      expect(actionA2Spy, 'Tick 3 actionA2Spy').not.toHaveBeenCalled();
      expect(conditionB1Spy, 'Tick 3 conditionB1Spy').toHaveBeenCalledTimes(3);
      expect(conditionB2Spy, 'Tick 3 conditionB2Spy').toHaveBeenCalledTimes(3);
      expect(deepActionSpy, 'Tick 3 deepActionSpy').toHaveBeenCalledTimes(3);
      expect(conditionB3Spy, 'Tick 3 conditionB3Spy').toHaveBeenCalledTimes(1); // Finally called
      expect(actionB4Spy, 'Tick 3 actionB4Spy').toHaveBeenCalledTimes(1); // Finally called
      expect(finalActionSpy, 'Tick 3 finalActionSpy').toHaveBeenCalledTimes(1); // Finally called
    });

    it('should handle a selector switching branches after a running sequence fails on re-evaluation', () => {
      let controllableConditionState = true;
      const controllableCondition = new ConditionNode(() => controllableConditionState, 'ControllableCondition');
      const runningAction = new ControllableActionNode(2, 'RunningAction');
      const fallbackAction = new ActionNode(() => NodeStatus.SUCCESS, 'FallbackAction');

      const runningSequence = new Sequence([controllableCondition, runningAction], 'RunningSequence');
      const fallbackSequence = new Sequence([fallbackAction], 'FallbackSequence');

      const rootSelector = new Selector([runningSequence, fallbackSequence], 'Root');

      const controllableConditionSpy = vi.spyOn(controllableCondition, 'execute');
      const runningActionSpy = vi.spyOn(runningAction, 'execute');
      const fallbackActionSpy = vi.spyOn(fallbackAction, 'execute');

      // --- Tick 1 ---
      // RootSelector picks RunningSequence. ControllableCondition is true, RunningAction returns RUNNING.
      let status = rootSelector.execute(mockHuman, mockContext, blackboard);
      expect(status, 'Tick 1 Status').toBe(NodeStatus.RUNNING);
      expect(rootSelector.runningChildIndex, 'Tick 1 runningChildIndex').toBe(0);
      expect(controllableConditionSpy, 'Tick 1 controllableConditionSpy').toHaveBeenCalledTimes(1);
      expect(runningActionSpy, 'Tick 1 runningActionSpy').toHaveBeenCalledTimes(1);
      expect(fallbackActionSpy, 'Tick 1 fallbackActionSpy').not.toHaveBeenCalled();

      // --- Tick 2 ---
      // Change the state so the initial condition will fail.
      controllableConditionState = false;

      // RootSelector resumes with RunningSequence. On re-evaluation, ControllableCondition fails.
      // RootSelector then moves to FallbackSequence, which succeeds.
      status = rootSelector.execute(mockHuman, mockContext, blackboard);
      expect(status, 'Tick 2 Status').toBe(NodeStatus.SUCCESS);
      expect(rootSelector.runningChildIndex, 'Tick 2 runningChildIndex').toBeUndefined();
      // Verify RunningSequence was re-evaluated
      expect(controllableConditionSpy, 'Tick 2 controllableConditionSpy').toHaveBeenCalledTimes(2);
      // But its action was not called again because the sequence failed early
      expect(runningActionSpy, 'Tick 2 runningActionSpy').toHaveBeenCalledTimes(1);
      // And the fallback was executed
      expect(fallbackActionSpy, 'Tick 2 fallbackActionSpy').toHaveBeenCalledTimes(1);
    });
  });
});

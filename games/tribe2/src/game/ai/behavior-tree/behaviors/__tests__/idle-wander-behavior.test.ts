import { describe, it, expect, beforeEach } from 'vitest';
import { createIdleWanderBehavior } from '../idle-wander-behavior';
import { createMockHuman, createMockContext } from './behavior-test-utils';
import { NodeStatus } from '../../behavior-tree-types';
import { Blackboard, BlackboardData } from '../../behavior-tree-blackboard';

describe('Idle Wander Behavior', () => {
  let human: ReturnType<typeof createMockHuman>;
  let context: ReturnType<typeof createMockContext>;
  let blackboard: BlackboardData;

  beforeEach(() => {
    human = createMockHuman();
    context = createMockContext();
    blackboard = Blackboard.create();
  });

  it('should always return SUCCESS', () => {
    const behavior = createIdleWanderBehavior(0);
    const status = behavior.execute(human, context, blackboard);
    expect(status).toBe(NodeStatus.SUCCESS);
  });

  it('should set activeAction to idle', () => {
    const behavior = createIdleWanderBehavior(0);
    behavior.execute(human, context, blackboard);
    expect(human.activeAction).toBe('idle');
  });

  it('should clear direction', () => {
    human.direction = { x: 1, y: 1 };
    const behavior = createIdleWanderBehavior(0);
    behavior.execute(human, context, blackboard);
    expect(human.direction).toEqual({ x: 0, y: 0 });
  });

  it('should clear target', () => {
    human.target = { x: 100, y: 100 };
    const behavior = createIdleWanderBehavior(0);
    behavior.execute(human, context, blackboard);
    expect(human.target).toBeUndefined();
  });

  it('should clear wanderTarget from blackboard', () => {
    Blackboard.set(blackboard, 'wanderTarget', { x: 100, y: 100 });
    const behavior = createIdleWanderBehavior(0);
    behavior.execute(human, context, blackboard);
    expect(Blackboard.get(blackboard, 'wanderTarget')).toBeUndefined();
  });

  it('should work multiple times in a row', () => {
    const behavior = createIdleWanderBehavior(0);
    
    // Execute multiple times
    for (let i = 0; i < 5; i++) {
      const status = behavior.execute(human, context, blackboard);
      expect(status).toBe(NodeStatus.SUCCESS);
      expect(human.activeAction).toBe('idle');
    }
  });

  it('should work with different depth values', () => {
    const depths = [0, 1, 2, 5];
    
    depths.forEach(depth => {
      const behavior = createIdleWanderBehavior(depth);
      const status = behavior.execute(human, context, blackboard);
      expect(status).toBe(NodeStatus.SUCCESS);
    });
  });
});

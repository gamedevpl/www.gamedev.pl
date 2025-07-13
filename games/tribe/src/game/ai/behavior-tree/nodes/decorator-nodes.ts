import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { Blackboard } from '../behavior-tree-blackboard';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';

/**
 * A decorator node that inverts the result of its child.
 * SUCCESS becomes FAILURE, and FAILURE becomes SUCCESS.
 * RUNNING remains RUNNING.
 */
export class Inverter implements BehaviorNode {
  constructor(private child: BehaviorNode) {}

  execute(human: HumanEntity, context: UpdateContext, blackboard: Blackboard): NodeStatus {
    // TODO: Implement decorator logic
    return this.child.execute(human, context, blackboard);
  }
}

/**
 * A decorator node that always returns SUCCESS, regardless of its child's status.
 */
export class Succeeder implements BehaviorNode {
  constructor(private child: BehaviorNode) {}

  execute(human: HumanEntity, context: UpdateContext, blackboard: Blackboard): NodeStatus {
    // TODO: Implement decorator logic
    this.child.execute(human, context, blackboard);
    return NodeStatus.SUCCESS;
  }
}

/**
 * A decorator node that repeats its child's execution a specified number of times.
 */
export class Repeater implements BehaviorNode {
  constructor(private readonly child: BehaviorNode) {}

  execute(human: HumanEntity, context: UpdateContext, blackboard: Blackboard): NodeStatus {
    // TODO: Implement decorator logic
    return this.child.execute(human, context, blackboard);
  }
}

/**
 * A decorator node that fails if its child takes too long to execute.
 */
export class Timeout implements BehaviorNode {
  constructor(private readonly child: BehaviorNode) {}

  execute(human: HumanEntity, context: UpdateContext, blackboard: Blackboard): NodeStatus {
    // TODO: Implement decorator logic
    return this.child.execute(human, context, blackboard);
  }
}

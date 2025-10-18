// Defines the possible states of a behavior tree node.
export enum BTStatus {
  SUCCESS,
  FAILURE,
  RUNNING,
}

// A generic context for the behavior tree. Using a Record is safer than `any`.
export type BTContext = Record<string, unknown>;

// Represents a node in the behavior tree.
export interface BTNode {
  execute(context: BTContext): BTStatus;
}

// Represents a behavior tree.
export interface BehaviorTree {
  root: BTNode;
  context: BTContext;
}

// Component to be attached to an entity
export interface BehaviorTreeComponent {
  tree: BehaviorTree;
  lastStatus?: BTStatus;
}

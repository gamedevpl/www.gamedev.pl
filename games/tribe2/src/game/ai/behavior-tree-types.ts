// Defines the possible states of a behavior tree node.
export enum BTStatus {
  SUCCESS,
  FAILURE,
  RUNNING,
}

// Represents a node in the behavior tree.
export interface BTNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute(context: any): BTStatus;
}

// Represents a behavior tree.
export interface BehaviorTree {
  root: BTNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any;
}

// Component to be attached to an entity
export interface BehaviorTreeComponent {
    tree: BehaviorTree;
    lastStatus?: BTStatus;
}

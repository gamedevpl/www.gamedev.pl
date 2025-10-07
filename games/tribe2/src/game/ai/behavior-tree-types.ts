// Defines the possible states of a behavior tree node.
export enum BTStatus {
  SUCCESS,
  FAILURE,
  RUNNING,
}

// Represents a node in the behavior tree.
export interface BTNode {
  execute(context: any): BTStatus;
}

// Represents a behavior tree.
export interface BehaviorTree {
  root: BTNode;
  context: any;
}

// Component to be attached to an entity
export interface BehaviorTreeComponent {
    tree: BehaviorTree;
    lastStatus?: BTStatus;
}

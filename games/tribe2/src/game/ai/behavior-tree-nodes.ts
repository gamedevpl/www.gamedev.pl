import { BTNode, BTStatus, BTContext } from './behavior-tree-types';

/**
 * A Sequence node executes its children in order.
 * It returns SUCCESS only if all children succeed.
 * It returns FAILURE if any child fails.
 * It returns RUNNING if any child is running.
 */
export class Sequence implements BTNode {
  private children: BTNode[];

  constructor(children: BTNode[]) {
    this.children = children;
  }

  execute(context: BTContext): BTStatus {
    for (const child of this.children) {
      const status = child.execute(context);
      if (status !== BTStatus.SUCCESS) {
        return status;
      }
    }
    return BTStatus.SUCCESS;
  }
}

/**
 * A Selector node executes its children in order.
 * It returns SUCCESS if any child succeeds.
 * It returns FAILURE only if all children fail.
 * It returns RUNNING if any child is running.
 */
export class Selector implements BTNode {
  private children: BTNode[];

  constructor(children: BTNode[]) {
    this.children = children;
  }

  execute(context: BTContext): BTStatus {
    for (const child of this.children) {
      const status = child.execute(context);
      if (status !== BTStatus.FAILURE) {
        return status;
      }
    }
    return BTStatus.FAILURE;
  }
}

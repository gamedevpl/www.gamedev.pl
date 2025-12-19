export * from './tree-state-types';
export * from './tree-growing-state';
export * from './tree-full-state';
export * from './tree-spreading-state';
export * from './tree-dying-state';

import { treeGrowingState } from './tree-growing-state';
import { treeFullState } from './tree-full-state';
import { treeSpreadingState } from './tree-spreading-state';
import { treeDyingState } from './tree-dying-state';

export const allTreeStates = [treeGrowingState, treeFullState, treeSpreadingState, treeDyingState];

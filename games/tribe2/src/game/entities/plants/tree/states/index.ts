export * from './tree-state-types';
export * from './tree-growing-state';
export * from './tree-full-state';

import { treeGrowingState } from './tree-growing-state';
import { treeFullState } from './tree-full-state';

export const allTreeStates = [treeGrowingState, treeFullState];

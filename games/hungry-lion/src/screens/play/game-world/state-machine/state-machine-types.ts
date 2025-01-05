export type StateType = string;

export type StateData = unknown;

export type StateUpdate = (data: StateData) => [StateType, StateData];

export type State = { id: StateType; update: StateUpdate };

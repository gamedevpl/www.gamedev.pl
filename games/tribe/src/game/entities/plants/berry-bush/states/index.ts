import { State } from "../../../../state-machine/state-machine-types";
import { BerryBushEntity } from "../berry-bush-types";
import { BerryBushStateData } from "./bush-state-types";
import { bushGrowingState } from "./bush-growing-state";
import { bushFullState } from "./bush-full-state";
import { bushSpreadingState } from "./bush-spreading-state";
import { bushDyingState } from "./bush-dying-state";

export const allBerryBushStates: State<BerryBushEntity, BerryBushStateData>[] = [
  bushGrowingState,
  bushFullState,
  bushSpreadingState,
  bushDyingState,
];

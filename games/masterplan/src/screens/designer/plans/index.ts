import { Unit } from '../designer-screen';
import * as balancedAssault from './balanced-assault';
import * as antiTankDefense from './anti-tank-defense';
import * as archerCounter from './archer-counter';
import * as warriorBlitz from './warrior-blitz';
import * as tankFormation from './tank-formation';
import * as artilleryStrike from './artillery-strike';
import * as archerAmbush from './archer-ambush';

export interface Plan {
  units: Unit[];
  name: string;
  probabilityScore: (playerUnits: Unit[]) => number;
}

export { balancedAssault, antiTankDefense, archerCounter, warriorBlitz, tankFormation, artilleryStrike, archerAmbush };

export const allPlans: Plan[] = [
  balancedAssault,
  antiTankDefense,
  archerCounter,
  warriorBlitz,
  tankFormation,
  artilleryStrike,
  archerAmbush,
];

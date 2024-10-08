import { Unit } from '../designer-types';
import * as balancedAssault from './balanced-assault';
import * as antiTankDefense from './anti-tank-defense';
import * as archerCounter from './archer-counter';
import * as warriorBlitz from './warrior-blitz';
import * as tankFormation from './tank-formation';
import * as artilleryStrike from './artillery-strike';
import * as archerAmbush from './archer-ambush';
import * as warriorCounter from './warrior-counter';
import * as artilleryCounter from './artillery-counter';

export interface Plan {
  units: Unit[];
  name: string;
  probabilityScore: (playerUnits: Unit[]) => number;
}

export {
  balancedAssault,
  antiTankDefense,
  archerCounter,
  warriorBlitz,
  tankFormation,
  artilleryStrike,
  archerAmbush,
  warriorCounter,
  artilleryCounter,
};

export const allPlans: Plan[] = [
  balancedAssault,
  antiTankDefense,
  archerCounter,
  warriorBlitz,
  tankFormation,
  artilleryStrike,
  archerAmbush,
  warriorCounter,
  artilleryCounter,
];

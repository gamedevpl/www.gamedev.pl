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
// Import new plans
import * as phalanxFormation from './phalanx-formation';
import * as cavalryCharge from './cavalry-charge';
import * as artilleryBarrage from './artillery-barrage';
import * as guerrillaTactics from './guerrilla-tactics';
import * as fortressDefense from './fortress-defense';
// Import 10 new AI plans
import * as pincerAttack from './pincer-attack';
import * as shieldWall from './shield-wall';
import * as blitzkrieg from './blitzkrieg';
import * as scorchedEarth from './scorched-earth';
import * as trojanHorse from './trojan-horse';
import * as flyingV from './flying-v';
import * as hammerAndAnvil from './hammer-and-anvil';
import * as echelonFormation from './echelon-formation';
import * as turtleFormation from './turtle-formation';
import * as skirmisherScreen from './skirmisher-screen';

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
  // Export new plans
  phalanxFormation,
  cavalryCharge,
  artilleryBarrage,
  guerrillaTactics,
  fortressDefense,
  // Export 10 new AI plans
  pincerAttack,
  shieldWall,
  blitzkrieg,
  scorchedEarth,
  trojanHorse,
  flyingV,
  hammerAndAnvil,
  echelonFormation,
  turtleFormation,
  skirmisherScreen,
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
  // Add new plans to allPlans array
  phalanxFormation,
  cavalryCharge,
  artilleryBarrage,
  guerrillaTactics,
  fortressDefense,
  // Add 10 new AI plans to allPlans array
  pincerAttack,
  shieldWall,
  blitzkrieg,
  scorchedEarth,
  trojanHorse,
  flyingV,
  hammerAndAnvil,
  echelonFormation,
  turtleFormation,
  skirmisherScreen,
];
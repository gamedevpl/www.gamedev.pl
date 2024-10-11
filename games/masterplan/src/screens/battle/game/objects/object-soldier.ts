import { GameObject } from './game-object';
import { GameWorld } from '../game-world';
import { SoldierPlan } from '../masterplan/soldierplan';
import { ArrowObject } from './object-arrow';
import { SoldierMovement } from './object-soldier-movement';
import { SoldierTargeting } from './object-soldier-targeting';
import { SoldierAttack } from './object-soldier-attack';
import { SoldierState } from './object-soldier-state';
import { SoldierRender } from './object-soldier-render';
import { SOLDIER_WIDTH, SOLDIER_HEIGHT, MAX_LIFE } from '../../consts';
import { $ } from '../../util/dom';
import { Canvas } from '../../util/canvas';
import { UnitType } from '../../../designer/designer-types';

let soldierID = 0;

export class SoldierObject extends GameObject {
  soldierId: number;
  plan: SoldierPlan;
  world: GameWorld;
  type: UnitType;
  color: string;
  image: any;
  imageDead: any;

  movement: SoldierMovement;
  targeting: SoldierTargeting;
  attack: SoldierAttack;
  state: SoldierState;
  soldierRender: SoldierRender;

  constructor(
    x: number,
    y: number,
    direction: number,
    plan: SoldierPlan,
    world: GameWorld,
    color: string,
    type: UnitType,
  ) {
    direction += (Math.random() - Math.random()) / 1000;
    super(x, y, SOLDIER_WIDTH, SOLDIER_HEIGHT, direction);
    this.soldierId = soldierID++;
    this.plan = plan;
    this.world = world;
    this.type = type;
    this.color = color;

    this.image = $('#asset-soldier-' + this.type);
    this.imageDead = $('#asset-soldier-' + this.type + '-dead');

    this.movement = new SoldierMovement(this);
    this.targeting = new SoldierTargeting(this);
    this.attack = new SoldierAttack(this);
    this.state = new SoldierState(this);
    this.soldierRender = new SoldierRender(this);

    this.initializeTypeSpecificProperties();
  }

  private initializeTypeSpecificProperties() {
    switch (this.type) {
      case 'warrior':
        this.initializeWarrior();
        break;
      case 'tank':
        this.initializeTank();
        break;
      case 'archer':
        this.initializeArcher();
        break;
      case 'artillery':
        this.initializeArtillery();
        break;
    }
  }

  private initializeWarrior() {
    this.state.setProperties({
      seekRange: 600,
      attackRange: 42,
      rangeDefence: 30,
      meleeDefence: 50,
      meleeAttack: 25,
      baseSpeed: 3,
      canCharge: true,
      isMelee: true,
    });
  }

  private initializeTank() {
    this.state.setProperties({
      seekRange: 600,
      attackRange: 46.2,
      rangeDefence: 100,
      meleeDefence: 100,
      meleeAttack: 15,
      life: MAX_LIFE * 2,
      defenceCooldown: 300,
      weight: 3,
      canCharge: false,
      isMelee: true,
    });
  }

  private initializeArcher() {
    this.state.setProperties({
      seekRange: 500,
      attackRange: 300,
      rangeAttack: 45,
      rangeDefence: 25,
      rangedCooldown: 1000,
      meleeDefence: 10,
      meleeAttack: 10,
      rangeType: 'arrow',
    });
  }

  private initializeArtillery() {
    this.state.setProperties({
      seekRange: 500,
      attackRange: 1500,
      weight: 10,
      baseSpeed: 0.1,
      rangeAttack: 100,
      rangeDefence: 1,
      rangedCooldown: 10000,
      meleeDefence: 1,
      meleeAttack: 1,
      rangeType: 'ball',
    });
  }

  update(deltaTime: number) {
    if (this.state.isAlive()) {
      this.updatePlan();
    } else if (this.targeting.hasEnemy()) {
      this.targeting.clearEnemy();
    }

    this.movement.update(deltaTime);
    this.state.update(deltaTime);
  }

  updatePlan() {
    if (!this.targeting.seekEnemy()) {
      this.plan.getCommand(this.world.getTime()).execute(this);
    }
  }

  render(canvas: Canvas) {
    this.soldierRender.render(canvas);
  }

  distance(soldier: SoldierObject) {
    return this.movement.distance(soldier);
  }

  hitByArrow(arrow: ArrowObject, distance: number) {
    this.attack.hitByArrow(arrow, distance);
  }

  isEnemy(ofSoldier: SoldierObject) {
    return this.plan.masterPlan !== ofSoldier.plan.masterPlan;
  }

  getClass() {
    return 'Soldier';
  }
}

import { Vec, VMath } from '../../util/vmath';
import { SoldierObject } from './object-soldier';
import { Terrain } from '../terrain/terrain';

export class SoldierMovement {
  private soldier: SoldierObject;
  private velocity: number = 0;
  private targetVelocity: number = 1;
  private force: [number, number] = [0, 0];
  private targetDirection: number;
  private terrain: Terrain;

  constructor(soldier: SoldierObject, terrain: Terrain) {
    this.soldier = soldier;
    this.targetDirection = soldier.getDirection();
    this.terrain = terrain;
  }

  update(deltaTime: number) {
    this.updateVelocity(deltaTime);
    this.updatePosition(deltaTime);
    this.updateDirection(deltaTime);
    this.updateForce(deltaTime);
  }

  private calculateTerrainSlope(): number {
    const currentHeight = this.terrain.getHeightAt([this.soldier.getX(), this.soldier.getY()]);
    const aheadPosition: Vec = [
      this.soldier.getX() + Math.cos(this.soldier.getDirection()) * 0.1,
      this.soldier.getY() + Math.sin(this.soldier.getDirection()) * 0.1,
    ];
    const aheadHeight = this.terrain.getHeightAt(aheadPosition);
    return aheadHeight - currentHeight;
  }

  private updateVelocity(deltaTime: number) {
    const slope = this.calculateTerrainSlope();
    let velocityMultiplier = 1;

    if (slope < 0) {
      // Moving downhill
      velocityMultiplier = 5 / 4;
    } else if (slope > 0) {
      // Moving uphill
      velocityMultiplier = 4 / 5;
    }

    const adjustedTargetVelocity = this.getTargetVelocity() * velocityMultiplier;
    this.velocity = adjustedTargetVelocity * deltaTime + this.velocity * (1 - deltaTime);
  }

  private updatePosition(deltaTime: number) {
    this.soldier.setX(this.soldier.getX() + this.force[0] * deltaTime);
    this.soldier.setY(this.soldier.getY() + this.force[1] * deltaTime);
  }

  private updateDirection(deltaTime: number) {
    const cx = Math.cos(this.soldier.getDirection()) * (1 - deltaTime);
    const cy = Math.sin(this.soldier.getDirection()) * (1 - deltaTime);
    const dx = Math.cos(this.targetDirection) * deltaTime;
    const dy = Math.sin(this.targetDirection) * deltaTime;
    this.soldier.setDirection(Math.atan2(cy + dy, cx + dx));
  }

  private updateForce(deltaTime: number) {
    if (this.soldier.state.isAlive()) {
      this.addForce(
        VMath.scale(
          [Math.cos(this.soldier.getDirection()), Math.sin(this.soldier.getDirection())],
          (this.velocity * (1 - Math.random()) * deltaTime) / 2,
        ),
      );
    }

    this.force = VMath.sub(this.force, VMath.scale(this.force, deltaTime * 0.1));
    if (VMath.length(this.force) < VMath.EPSILON) {
      this.force = [0, 0];
    }
  }

  setTargetDirection(targetDirection: number) {
    this.targetDirection = targetDirection;
  }

  setTargetVelocity(targetVelocity: number) {
    this.targetVelocity = targetVelocity * this.soldier.state.baseSpeed;
  }

  getTargetVelocity() {
    return this.targetVelocity;
  }

  getVelocity() {
    return this.velocity;
  }

  addForce(vec: [number, number]) {
    this.force = VMath.add(this.force, vec);
  }

  distance(otherSoldier: SoldierObject) {
    return VMath.distance(this.soldier.vec, otherSoldier.vec);
  }
}

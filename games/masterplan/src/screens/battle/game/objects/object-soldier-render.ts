import { SoldierObject } from './object-soldier';
import { Canvas } from '../../util/canvas';
import { MAX_LIFE } from '../../consts';

export class SoldierRender {
  private soldier: SoldierObject;

  constructor(soldier: SoldierObject) {
    this.soldier = soldier;
  }

  render(canvas: Canvas) {
    canvas
      .save()
      .translate(-this.soldier.getWidth() / 2, -this.soldier.getHeight() / 2)
      .drawImage(this.soldier.state.isAlive() ? this.soldier.image : this.soldier.imageDead, 0, 0);

    if (this.soldier.state.isAlive()) {
      if (this.soldier.state.life < MAX_LIFE) {
        canvas.drawText(10, 0, String(this.soldier.state.life << 0));
      }
      canvas.fillStyle(this.soldier.color).fillRect(0, 10, 10, (5 * this.soldier.state.life) / MAX_LIFE);
    }

    canvas.restore();
  }

  // Additional visual effects methods can be added here
  // For example:
  // renderAttackEffect(canvas: Canvas) { ... }
  // renderDamageEffect(canvas: Canvas) { ... }
}

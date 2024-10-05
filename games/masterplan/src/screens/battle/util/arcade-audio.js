import { jsfxr } from '../lib/jsfxr';

/** @constructor */
export function ArcadeAudio() {
  this.sounds = {};
}

ArcadeAudio.prototype.add = function (key, count, settings) {
  this.sounds[key] = [];
  settings.forEach(function (elem, index) {
    this.sounds[key].push({
      tick: 0,
      count: count,
      pool: [],
    });
    for (var i = 0; i < count; i++) {
      var audio = new Audio();
      audio.src = jsfxr(elem);
      this.sounds[key][index].pool.push(audio);
    }
  }, this);
};

ArcadeAudio.prototype.play = function (key) {
  var sound = this.sounds[key];
  var soundData = sound.length > 1 ? sound[Math.floor(Math.random() * sound.length)] : sound[0];
  soundData.pool[soundData.tick].play();
  soundData.tick < soundData.count - 1 ? soundData.tick++ : (soundData.tick = 0);
};

export const aa = new ArcadeAudio();

aa.add('arrow', 10, [
  [0, 0.13, 0.12, 0.21, 0.28, 0.7097, 0.11, 0.4399, , , , 0.2845, 0.6608, , , , , , 1, , , , , 0.32],
]);
aa.add('hitarrow', 10, [[2, , 0.0664, , 0.1176, 0.7984, , -0.5791, , , , , , , , , , , 1, , , 0.0922, , 0.47]]);
aa.add('damage', 10, [[3, , 0.0421, , 0.1467, 0.7815, , -0.4846, , , , , , 0.4464, , , , , 1, , , 0.2247, , 0.47]]);

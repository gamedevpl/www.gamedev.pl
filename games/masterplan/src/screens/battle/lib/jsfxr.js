import { SfxrSynth } from './sfxr-synth';

// Adapted from http://codebase.es/riffwave/
var synth = new SfxrSynth();
// Export for the Closure Compiler
export const jsfxr = function (settings) {
  // Initialize SfxrParams
  synth._params.setSettings(settings);
  // Synthesize Wave
  var envelopeFullLength = synth.totalReset();
  var data = new Uint8Array((((envelopeFullLength + 1) / 2) | 0) * 4 + 44);
  var used = synth.synthWave(new Uint16Array(data.buffer, 44), envelopeFullLength) * 2;
  var dv = new Uint32Array(data.buffer, 0, 44);
  // Initialize header
  dv[0] = 0x46464952; // "RIFF"
  dv[1] = used + 36; // put total size here
  dv[2] = 0x45564157; // "WAVE"
  dv[3] = 0x20746d66; // "fmt "
  dv[4] = 0x00000010; // size of the following
  dv[5] = 0x00010001; // Mono: 1 channel, PCM format
  dv[6] = 0x0000ac44; // 44,100 samples per second
  dv[7] = 0x00015888; // byte rate: two bytes per sample
  dv[8] = 0x00100002; // 16 bits per sample, aligned on every two bytes
  dv[9] = 0x61746164; // "data"
  dv[10] = used; // put number of samples here

  // Base64 encoding written by me, @maettig
  used += 44;
  var i = 0,
    base64Characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
    output = 'data:audio/wav;base64,';
  for (; i < used; i += 3) {
    var a = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    output +=
      base64Characters[a >> 18] +
      base64Characters[(a >> 12) & 63] +
      base64Characters[(a >> 6) & 63] +
      base64Characters[a & 63];
  }
  return output;
};

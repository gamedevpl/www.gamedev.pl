import { DesignerUnit } from './designer/designer-unit';
import { $ } from './util';

export function saveBattleString(defs, targetId) {
  targetId = targetId || 'battle-string';
  var iter = (obj) => {
    return [
      obj['sizeCol'],
      obj['sizeRow'],
      obj['col'],
      obj['row'],
      DesignerUnit.types[obj['type']],
      DesignerUnit.commands[obj['command']],
    ];
  };
  var username = (defs.username || '').split('').map((ch) => ch.charCodeAt(0));
  var arr = defs.map(iter).reduce((r, d) => r.concat([d.length], d), []);
  defs = new Uint8Array([arr.length].concat(arr.concat(username)));
  var decoder = new TextDecoder('utf8');
  var encoded = btoa(decoder.decode(defs));
  try {
    localStorage[targetId] = encoded;
  } catch {
    // Silently fail if localStorage is not available
  }
}

export function loadBattleString(targetId, value) {
  targetId = targetId || 'battle-string';
  var encoder = new TextEncoder('utf8');
  var defs = encoder.encode(atob(value ?? localStorage[targetId]));
  var result = [];
  var length = defs[0];
  for (var i = 1; i <= length; ) {
    var l = defs[i];
    var v = defs.slice(i + 1, i + l + 1);
    result.push({
      sizeCol: v[0],
      sizeRow: v[1],
      col: v[2],
      row: v[3],
      type: DesignerUnit.types[v[4]],
      command: DesignerUnit.commands[v[5]],
    });
    i += l + 1;
  }

  var username = Array['from'](defs.slice(length + 1));
  result.username = (
    username
      .map((ch) => String.fromCharCode(ch))
      .join('')
      .match(/(\w)+/g) || []
  ).join('');

  return result;
}

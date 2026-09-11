import { moderateText } from '../src/platform/moderation.js';
const hits = new Map<string, string>();
const N = 200000;
for (let i = 0; i < N; i++) {
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const text = `A short arcade game where you dodge falling rocks and survive as long as possible. E2E smoke ${nonce}.`;
  const v = moderateText(text);
  if (!v.allowed) hits.set(nonce, String(v.category));
}
console.log('rejected', hits.size, 'of', N, `(${((hits.size / N) * 100).toFixed(3)}%)`);
for (const [n, c] of [...hits].slice(0, 10)) console.log('  ', n, '->', c);

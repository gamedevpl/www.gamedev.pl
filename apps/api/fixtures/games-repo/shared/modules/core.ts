// The bundler always loads `shared/modules/core.ts` and freezes `window.GameKit`
// afterwards, so this file has to exist and define that object. The fixture games do
// not use it — they are plain canvas TypeScript — so it stays empty on purpose rather
// than growing into a second, drifting copy of the real GameKit.
(window as unknown as { GameKit: Record<string, unknown> }).GameKit = {};

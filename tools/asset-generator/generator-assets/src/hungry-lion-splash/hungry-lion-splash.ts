import { Asset } from '../../../generator-core/src/assets-types';

export const HungryLionSplash: Asset = {
  name: 'hungry-lion-splash',
  stances: ['default'],
  description: `
# Hungry Lion Splash Screen

This is a splash screen for a game featuring a hungry lion. The lion is depicted in a cartoonish style, with exaggerated features and vibrant colors. The background is a jungle scene, with lush greenery and tropical plants. The lion's expression is playful and mischievous, inviting players to join in the fun.

## Description

The splash screen features a cartoonish lion with a big smile, surrounded by tropical plants and trees. The lion is in the center of the screen, with its mouth open as if roaring playfully. The background is a vibrant jungle scene, filled with various shades of green and colorful flowers. The overall feel is fun and inviting, perfect for a game setting.

## Usage

This splash screen can be used as an introduction to a game, setting the tone for a fun and adventurous experience. It can be displayed when the game is loading or starting up, giving players a glimpse of the game's theme and style.
The game is a web application, and the splash screen is displayed in a canvas element. The lion's animation is simple, with a slight bounce effect to make it more engaging. The background is static, but the colors are bright and eye-catching.
`,
  render(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, progress: number): void {},
};

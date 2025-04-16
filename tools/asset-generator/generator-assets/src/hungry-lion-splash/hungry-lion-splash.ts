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

The rendering should work well for different proportions and screen sizes, ensuring that the lion remains the focal point of the splash screen. The canvas should be responsive, adapting to various devices and resolutions.

## Implementation

The splash screen is implemented using HTML5 canvas. The lion is drawn using basic shapes and colors, with a simple animation effect to make it more lively. The background is a static image of a jungle scene, which is drawn behind the lion.
The lion's animation is achieved using a simple bounce effect, where the lion moves up and down slightly to create a playful appearance. The canvas is cleared and redrawn at regular intervals to create the animation effect.
The lion's position and size are adjustable, allowing for customization based on the game's requirements. The canvas is responsive, adapting to different screen sizes while maintaining the aspect ratio of the lion and background.
The splash screen is designed to be lightweight and efficient, ensuring quick loading times and smooth performance. The colors are bright and vibrant, making the lion stand out against the jungle background. The overall design is fun and engaging, perfect for attracting players' attention and setting the mood for the game.

Do not use gradients or complex patterns in the rendering. The lion should be drawn using solid colors and simple shapes to maintain a cartoonish style. The background should also be simple, with a focus on vibrant colors rather than intricate details.

Render function should be hermetic, meaning it should not depend on any external state or variables. It should only use the parameters passed to it to render the lion and background. This ensures that the rendering is consistent and reliable, regardless of the environment or context in which it is used.
`,
  render(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, progress: number): void {},
};

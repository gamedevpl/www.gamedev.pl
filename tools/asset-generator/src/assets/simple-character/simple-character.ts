import { CanvasRenderingContext2D } from 'canvas';
import { Asset } from '../assets-types';

export const SimpleCharacter: Asset = {
  name: 'simple-character',
  description: `A cartoon-style character with an angry expression and bold, minimalist design.

Visual Style:
- Bold, clean lines with clear silhouette
- Vibrant color palette: yellow for head, light blue for body, black for details
- Exaggerated proportions for emotional impact
- Minimalist yet expressive features
- Strong contrast between main shapes and details

Character Mood:
- Conveys anger through exaggerated eyebrows and downturned mouth
- Dynamic pose suggesting tension and energy

Technical Requirements:
- Dimensions: 300x300 pixels
- Support walk animation via 'animationProgress' parameter
- Efficient use of basic geometric shapes
- Must be implemented using only 10 rectangles.
- Must not use any other shapes or paths
- Implementation must be contained entirely within the 'render' function.
`,
  render(ctx: CanvasRenderingContext2D, animationProgress: number = 0): void {
    // Constants for character dimensions and positioning
    const CHARACTER_WIDTH = 100;
    const CHARACTER_HEIGHT = 200;
    const CENTER_X = 150;
    const CENTER_Y = 150;
    
    // Animation calculations
    const walkOffset = Math.sin(animationProgress * Math.PI * 2) * 10;
    const bodyTilt = Math.sin(animationProgress * Math.PI * 2) * 0.1;
    
    // Save the current context state
    ctx.save();
    
    // Move to character center and apply animation tilt
    ctx.translate(CENTER_X, CENTER_Y);
    ctx.rotate(bodyTilt);
    
    // Draw body (Rectangle 1)
    ctx.fillStyle = '#87CEEB'; // Light blue
    ctx.fillRect(
      -CHARACTER_WIDTH / 2,
      -CHARACTER_HEIGHT / 2,
      CHARACTER_WIDTH,
      CHARACTER_HEIGHT * 0.6
    );
    
    // Draw legs with walk animation
    // Left leg (Rectangle 2)
    ctx.fillRect(
      -CHARACTER_WIDTH / 3,
      CHARACTER_HEIGHT * 0.1 + walkOffset,
      CHARACTER_WIDTH / 4,
      CHARACTER_HEIGHT * 0.4
    );
    
    // Right leg (Rectangle 3)
    ctx.fillRect(
      CHARACTER_WIDTH / 12,
      CHARACTER_HEIGHT * 0.1 - walkOffset,
      CHARACTER_WIDTH / 4,
      CHARACTER_HEIGHT * 0.4
    );
    
    // Draw head (Rectangle 4)
    ctx.fillStyle = '#FFD700'; // Yellow
    const headSize = CHARACTER_WIDTH * 0.8;
    ctx.fillRect(
      -headSize / 2,
      -CHARACTER_HEIGHT / 2 - headSize * 0.8,
      headSize,
      headSize
    );
    
    // Draw angry eyebrows (Rectangles 5 and 6)
    ctx.fillStyle = '#000000';
    const eyebrowWidth = headSize * 0.4;
    const eyebrowHeight = headSize * 0.1;
    
    // Left eyebrow
    ctx.save();
    ctx.translate(-headSize / 4, -CHARACTER_HEIGHT / 2 - headSize * 0.5);
    ctx.rotate(-Math.PI / 6);
    ctx.fillRect(-eyebrowWidth / 2, -eyebrowHeight / 2, eyebrowWidth, eyebrowHeight);
    ctx.restore();
    
    // Right eyebrow
    ctx.save();
    ctx.translate(headSize / 4, -CHARACTER_HEIGHT / 2 - headSize * 0.5);
    ctx.rotate(Math.PI / 6);
    ctx.fillRect(-eyebrowWidth / 2, -eyebrowHeight / 2, eyebrowWidth, eyebrowHeight);
    ctx.restore();
    
    // Draw eyes (Rectangles 7 and 8)
    const eyeSize = headSize * 0.15;
    ctx.fillRect(-headSize / 4 - eyeSize / 2, -CHARACTER_HEIGHT / 2 - headSize * 0.4, eyeSize, eyeSize);
    ctx.fillRect(headSize / 4 - eyeSize / 2, -CHARACTER_HEIGHT / 2 - headSize * 0.4, eyeSize, eyeSize);
    
    // Draw angry mouth (Rectangles 9 and 10)
    const mouthWidth = headSize * 0.3;
    const mouthHeight = headSize * 0.1;
    
    ctx.save();
    ctx.translate(-mouthWidth / 2, -CHARACTER_HEIGHT / 2 - headSize * 0.2);
    ctx.rotate(-Math.PI / 12);
    ctx.fillRect(0, 0, mouthWidth, mouthHeight);
    ctx.restore();
    
    ctx.save();
    ctx.translate(mouthWidth / 2, -CHARACTER_HEIGHT / 2 - headSize * 0.2);
    ctx.rotate(Math.PI / 12);
    ctx.fillRect(-mouthWidth, 0, mouthWidth, mouthHeight);
    ctx.restore();
    
    // Restore the original context state
    ctx.restore();
  },
};
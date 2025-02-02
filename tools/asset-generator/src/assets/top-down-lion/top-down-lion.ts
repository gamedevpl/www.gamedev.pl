import { CanvasRenderingContext2D } from 'canvas';
import { Asset } from '../assets-types';

export const TopDownLion: Asset = {
  name: 'top-down-lion',
  description: `A top down view of a lion:
- Head (circle)
- Body
- Tail

Style: cartoon
Dimensions: fit within 300x300 square
  `,
  render: (ctx: CanvasRenderingContext2D): void => {
    const centerX = 150;
    const centerY = 150;
    const headRadius = 35; // Increased head radius
    const bodyWidth = 100;
    const bodyHeight = 70;
    const tailLength = 80;

    // Colors
    const mainColor = 'goldenrod';
    const darkColor = '#a57c00'; // Darker shade for outlines and details
    const lightColor = '#f0d78d'; // Lighter shade for highlights
    const maneColor = '#c69a00';
    const noseColor = '#5c3c00'; // Distinct color for the nose

    // Draw the body
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 15, bodyWidth / 2, bodyHeight / 2, 0, 0, 2 * Math.PI);
    ctx.fillStyle = mainColor;
    ctx.fill();
    ctx.lineWidth = 2; // Thicker outline
    ctx.strokeStyle = darkColor;
    ctx.stroke();

    // Draw the head (slightly oval)
    ctx.beginPath();
    ctx.ellipse(centerX, centerY - 30, headRadius, headRadius * 0.8, 0, 0, 2 * Math.PI);
    ctx.fillStyle = mainColor;
    ctx.fill();
    ctx.lineWidth = 2; // Thicker outline
    ctx.strokeStyle = darkColor;
    ctx.stroke();

     // Draw the mane (more organic shape)
    ctx.fillStyle = maneColor;
    ctx.beginPath();
    ctx.moveTo(centerX - headRadius - 5, centerY - 30);
    ctx.bezierCurveTo(
        centerX - headRadius - 20, centerY - 50,
        centerX - headRadius + 20 , centerY - 70,
        centerX, centerY - 75
    );
    ctx.bezierCurveTo(
        centerX + headRadius - 20, centerY - 70,
        centerX + headRadius + 20, centerY - 50,
        centerX + headRadius + 5, centerY - 30
    );
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = darkColor;
    ctx.stroke();

    // Draw the eyes
    ctx.beginPath();
    ctx.arc(centerX - 10, centerY - 40, 3, 0, 2 * Math.PI);
    ctx.fillStyle = 'black';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(centerX + 10, centerY - 40, 3, 0, 2 * Math.PI);
    ctx.fillStyle = 'black';
    ctx.fill();

    // Draw the nose
    ctx.beginPath();
    ctx.moveTo(centerX - 4, centerY - 25);
    ctx.lineTo(centerX + 4, centerY - 25);
    ctx.lineTo(centerX, centerY - 22);
    ctx.fillStyle = noseColor;
    ctx.fill();

    // Draw the tail (thicker and more curved)
    ctx.beginPath();
    ctx.moveTo(centerX - bodyWidth / 2 + 5, centerY + bodyHeight / 2 + 5);
    ctx.bezierCurveTo(
      centerX - bodyWidth / 2 - 20, centerY + bodyHeight / 2 + tailLength / 4 + 5,
      centerX - bodyWidth / 2 - 20, centerY + bodyHeight / 2 + tailLength * 3/4,
      centerX - bodyWidth / 2 - 30, centerY + bodyHeight / 2 + tailLength
    );
    ctx.lineWidth = 8; // Thicker tail
    ctx.lineCap = 'round';
    ctx.strokeStyle = mainColor;
    ctx.stroke();

    // Tail tuft (more volume)
     ctx.beginPath();
    ctx.moveTo(centerX - bodyWidth / 2 - 30, centerY + bodyHeight / 2 + tailLength);
    ctx.lineTo(centerX - bodyWidth / 2 - 35, centerY + bodyHeight / 2 + tailLength + 8);
    ctx.lineTo(centerX - bodyWidth / 2 - 25, centerY + bodyHeight / 2 + tailLength + 16);
    ctx.lineTo(centerX - bodyWidth / 2 - 15, centerY + bodyHeight / 2 + tailLength + 5);
    ctx.closePath();
    ctx.fillStyle = maneColor;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = darkColor;
    ctx.stroke();
  },
};

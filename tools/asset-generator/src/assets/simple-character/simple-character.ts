import { CanvasRenderingContext2D } from 'canvas';
import { Asset } from '../assets-types';

export const SimpleCharacter: Asset = {
  name: 'simple-character',
  description: `Simple character should have following parts:
- Head (circle)
    - No hair
    - Eyes
    - Eyebrows
    - Mouth
- Body (a rectangle)
- Arms (2 lines)
- Hands (2 small circles)
- Legs (2 lines)
- Feet (2 small circles)

Characteristics:
- character must have angry face expression

Desired dimensions:
- fit within 300x300 square

Rendering requirements:
- can be rendered in a rotation over Y axis (3d rotation)

Visual style:
- cartoon style
`,
  render(ctx: CanvasRenderingContext2D): void {
    const centerX = 150;
    const centerY = 150;
    const headRadius = 40;
    const bodyWidth = 60;
    const bodyHeight = 80;
    const armLength = 50;
    const legLength = 60;
    const handRadius = 10; // Increased hand radius
    const footRadius = 10; // Increased foot radius

    // Head
    ctx.beginPath();
    ctx.arc(centerX, centerY - bodyHeight / 2 - headRadius, headRadius, 0, 2 * Math.PI);
    ctx.fillStyle = 'yellow';
    ctx.fill();
    ctx.stroke();

    // Eyes
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(centerX - 15, centerY - bodyHeight / 2 - headRadius + 10, 4, 0, 2 * Math.PI); // Smaller eyes
    ctx.fill();
    ctx.beginPath();
    ctx.arc(centerX + 15, centerY - bodyHeight / 2 - headRadius + 10, 4, 0, 2 * Math.PI); // Smaller eyes
    ctx.fill();

    // Eyebrows
    ctx.beginPath();
    ctx.moveTo(centerX - 20, centerY - bodyHeight / 2 - headRadius - 10);
    ctx.lineTo(centerX - 10, centerY - bodyHeight / 2 - headRadius - 25); // More angled eyebrows
    ctx.moveTo(centerX + 20, centerY - bodyHeight / 2 - headRadius - 10);
    ctx.lineTo(centerX + 10, centerY - bodyHeight / 2 - headRadius - 25); // More angled eyebrows
    ctx.stroke();

    // Mouth
    ctx.beginPath();
    ctx.moveTo(centerX - 15, centerY - bodyHeight / 2 - headRadius + 30);
    ctx.quadraticCurveTo(centerX, centerY - bodyHeight / 2 - headRadius + 40, centerX + 15, centerY - bodyHeight / 2 - headRadius + 30); // Downward curved mouth
    ctx.stroke();

    // Body
    ctx.fillStyle = 'lightblue';
    ctx.fillRect(centerX - bodyWidth / 2, centerY - bodyHeight / 2, bodyWidth, bodyHeight);
    ctx.strokeRect(centerX - bodyWidth / 2, centerY - bodyHeight / 2, bodyWidth, bodyHeight);

    // Arms
    ctx.beginPath();
    ctx.moveTo(centerX - bodyWidth / 2, centerY - bodyHeight / 2 + 20);
    ctx.lineTo(centerX - bodyWidth / 2 - armLength, centerY - bodyHeight / 2 + 30); // Slightly angled arms
    ctx.moveTo(centerX + bodyWidth / 2, centerY - bodyHeight / 2 + 20);
    ctx.lineTo(centerX + bodyWidth / 2 + armLength, centerY - bodyHeight / 2 + 30); // Slightly angled arms
    ctx.stroke();

    // Hands
    ctx.beginPath();
    ctx.arc(centerX - bodyWidth / 2 - armLength, centerY - bodyHeight / 2 + 30, handRadius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(centerX + bodyWidth / 2 + armLength, centerY - bodyHeight / 2 + 30, handRadius, 0, 2 * Math.PI);
    ctx.fill();

    // Legs
    ctx.beginPath();
    ctx.moveTo(centerX - bodyWidth / 4, centerY + bodyHeight / 2);
    ctx.lineTo(centerX - bodyWidth / 4 - 10, centerY + bodyHeight / 2 + legLength); // Slightly angled legs
    ctx.moveTo(centerX + bodyWidth / 4, centerY + bodyHeight / 2);
    ctx.lineTo(centerX + bodyWidth / 4 + 10, centerY + bodyHeight / 2 + legLength); // Slightly angled legs
    ctx.stroke();

    // Feet
    ctx.beginPath();
    ctx.arc(centerX - bodyWidth / 4 - 10, centerY + bodyHeight / 2 + legLength, footRadius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(centerX + bodyWidth / 4 + 10, centerY + bodyHeight / 2 + legLength, footRadius, 0, 2 * Math.PI);
    ctx.fill();
  },
};

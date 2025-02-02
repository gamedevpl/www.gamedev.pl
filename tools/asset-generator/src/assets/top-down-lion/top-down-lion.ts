import { CanvasRenderingContext2D } from 'canvas';
import { Asset } from '../assets-types';

export const TopDownLion: Asset = {
  name: 'top-down-lion',
  description: 'A top down view of a lion',
  render: (ctx): void => {
    // Constants for lion dimensions and positioning
    const centerX = ctx.canvas.width / 2;
    const centerY = ctx.canvas.height / 2;
    const bodyRadius = Math.min(ctx.canvas.width, ctx.canvas.height) * 0.2;

    // Color palette with more variations
    const colors = {
      bodyMain: '#c2956e',
      bodyLight: '#d4a77f',
      bodyDark: '#b38a63',
      maneMain: '#8b5e34',
      maneDark: '#724c2b',
      maneLight: '#a47241',
      eyeColor: '#2c1810',
      noseColor: '#433029',
    };

    // Draw the body (main circular shape) with gradient
    const bodyGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, bodyRadius);
    bodyGradient.addColorStop(0, colors.bodyLight);
    bodyGradient.addColorStop(1, colors.bodyMain);

    ctx.beginPath();
    ctx.fillStyle = bodyGradient;
    ctx.arc(centerX, centerY, bodyRadius, 0, Math.PI * 2);
    ctx.fill();

    // Draw the mane with more organic, varied strokes
    for (let i = 0; i < 32; i++) {
      const angle = (i * Math.PI * 2) / 32;
      const maneLength = bodyRadius * (0.3 + Math.random() * 0.2); // Varied lengths
      const x1 = centerX + Math.cos(angle) * bodyRadius;
      const y1 = centerY + Math.sin(angle) * bodyRadius;
      const x2 = centerX + Math.cos(angle) * (bodyRadius + maneLength);
      const y2 = centerY + Math.sin(angle) * (bodyRadius + maneLength);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineWidth = bodyRadius * (0.12 + Math.random() * 0.06); // Varied widths
      ctx.strokeStyle = i % 2 === 0 ? colors.maneMain : colors.maneDark;
      ctx.stroke();
    }

    // Draw the legs with gradient
    const legPositions = [
      { angle: -Math.PI / 4, offset: -1 }, // Front right
      { angle: Math.PI / 4, offset: -1 }, // Front left
      { angle: (-Math.PI * 3) / 4, offset: 1 }, // Back right
      { angle: (Math.PI * 3) / 4, offset: 1 }, // Back left
    ];

    legPositions.forEach(({ angle }) => {
      const legX = centerX + Math.cos(angle) * bodyRadius * 0.8;
      const legY = centerY + Math.sin(angle) * bodyRadius * 0.8;

      const legGradient = ctx.createRadialGradient(legX, legY, 0, legX, legY, bodyRadius * 0.2);
      legGradient.addColorStop(0, colors.bodyLight);
      legGradient.addColorStop(1, colors.bodyMain);

      ctx.beginPath();
      ctx.fillStyle = legGradient;
      ctx.arc(legX, legY, bodyRadius * 0.2, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw the tail with curved path and gradient
    ctx.beginPath();
    ctx.lineWidth = bodyRadius * 0.1;
    const tailGradient = ctx.createLinearGradient(centerX - bodyRadius, centerY, centerX - bodyRadius * 1.8, centerY);
    tailGradient.addColorStop(0, colors.bodyMain);
    tailGradient.addColorStop(1, colors.bodyDark);
    ctx.strokeStyle = tailGradient;
    ctx.moveTo(centerX - bodyRadius, centerY);
    ctx.quadraticCurveTo(centerX - bodyRadius * 1.5, centerY + bodyRadius * 0.5, centerX - bodyRadius * 1.8, centerY);
    ctx.stroke();

    // Draw tail tuft with gradient
    const tuftGradient = ctx.createRadialGradient(
      centerX - bodyRadius * 1.8,
      centerY,
      0,
      centerX - bodyRadius * 1.8,
      centerY,
      bodyRadius * 0.15,
    );
    tuftGradient.addColorStop(0, colors.maneLight);
    tuftGradient.addColorStop(1, colors.maneDark);

    ctx.beginPath();
    ctx.fillStyle = tuftGradient;
    ctx.arc(centerX - bodyRadius * 1.8, centerY, bodyRadius * 0.15, 0, Math.PI * 2);
    ctx.fill();

    // Draw the head with gradient
    const headGradient = ctx.createRadialGradient(
      centerX + bodyRadius * 0.8,
      centerY,
      0,
      centerX + bodyRadius * 0.8,
      centerY,
      bodyRadius * 0.4,
    );
    headGradient.addColorStop(0, colors.bodyLight);
    headGradient.addColorStop(1, colors.bodyMain);

    ctx.beginPath();
    ctx.fillStyle = headGradient;
    ctx.arc(centerX + bodyRadius * 0.8, centerY, bodyRadius * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Draw ears with gradient
    const earSize = bodyRadius * 0.2;
    [-1, 1].forEach((side) => {
      const earX = centerX + bodyRadius * 0.8 + side * earSize;
      const earY = centerY - earSize;

      const earGradient = ctx.createRadialGradient(earX, earY, 0, earX, earY, earSize);
      earGradient.addColorStop(0, colors.bodyLight);
      earGradient.addColorStop(1, colors.bodyDark);

      ctx.beginPath();
      ctx.fillStyle = earGradient;
      ctx.arc(earX, earY, earSize, 0, Math.PI * 2);
      ctx.fill();
    });

    // Add facial features
    const headCenterX = centerX + bodyRadius * 0.8;

    // Eyes
    [-1, 1].forEach((side) => {
      const eyeX = headCenterX + side * bodyRadius * 0.15;
      const eyeY = centerY - bodyRadius * 0.05;
      const eyeSize = bodyRadius * 0.06;

      // Eye shadow
      ctx.beginPath();
      ctx.fillStyle = colors.maneDark;
      ctx.arc(eyeX, eyeY, eyeSize * 1.2, 0, Math.PI * 2);
      ctx.fill();

      // Eye
      ctx.beginPath();
      ctx.fillStyle = colors.eyeColor;
      ctx.arc(eyeX, eyeY, eyeSize, 0, Math.PI * 2);
      ctx.fill();

      // Eye highlight
      ctx.beginPath();
      ctx.fillStyle = 'white';
      ctx.arc(eyeX - eyeSize * 0.2, eyeY - eyeSize * 0.2, eyeSize * 0.4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Nose
    ctx.beginPath();
    ctx.fillStyle = colors.noseColor;
    ctx.arc(headCenterX + bodyRadius * 0.2, centerY + bodyRadius * 0.1, bodyRadius * 0.08, 0, Math.PI * 2);
    ctx.fill();
  },
};

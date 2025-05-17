import { Asset } from '../../../generator-core/src/assets-types';

export const HungryLionSplash: Asset = {
  name: 'hungry-lion-splash',
  description: 'A splash screen featuring a hungry lion in a cartoonish style, with a jungle background and animated title.',
  referenceImage: undefined,
  stances: ['initialising', 'persistent'],
  render: (ctx, x, y, width, height, progress, stance, direction) => {
    ctx.save();

    const centerX = x + width / 2;
    const centerY = y + height / 2;

    // Animation parameters
    let scaleFactor = 1;
    let alphaFactor = 1;
    let bounceOffsetY = 0;

    const lionBaseSize = Math.min(width, height) * 0.35;
    const titleBaseFontSize = Math.min(width, height) * 0.08;

    if (stance === 'initialising') {
      scaleFactor = progress; // Scale from 0 to 1
      alphaFactor = progress; // Fade in from 0 to 1
    } else if (stance === 'persistent') {
      const bounceSpeed = 3; // Radians per second, adjust for desired speed
      const bounceAmplitude = height * 0.015; // 1.5% of height for a slight bounce
      bounceOffsetY = Math.sin(progress * bounceSpeed) * bounceAmplitude;
    }

    ctx.globalAlpha = alphaFactor;

    // --- Static Background --- (Not affected by main animation progress or bounce)
    // Sky
    ctx.fillStyle = '#87CEEB'; // Sky Blue
    ctx.fillRect(x, y, width, height);

    // Ground
    ctx.fillStyle = '#32CD32'; // Lime Green
    ctx.fillRect(x, y + height * 0.75, width, height * 0.25);

    // Simple Trees (stylized)
    const drawTree = (treeX: number, treeCrownY: number, trunkH: number, crownR: number, trunkColor: string, crownColor: string) => {
      // Trunk
      ctx.fillStyle = trunkColor;
      const trunkW = crownR * 0.3;
      ctx.fillRect(treeX - trunkW / 2, treeCrownY, trunkW, trunkH);
      // Crown (simple circle)
      ctx.fillStyle = crownColor;
      ctx.beginPath();
      ctx.arc(treeX, treeCrownY, crownR, 0, Math.PI * 2);
      ctx.fill();
    };

    drawTree(x + width * 0.2, y + height * 0.75 - height * 0.15, height * 0.2, height * 0.15, '#8B4513', '#2E8B57'); // Left tree
    drawTree(x + width * 0.8, y + height * 0.75 - height * 0.25, height * 0.3, height * 0.2, '#A0522D', '#006400'); // Right tree

    // Simple Bushes with Flowers
    const drawBush = (bushX: number, bushY: number, bushR: number, bushColor: string, flowerColor: string) => {
      ctx.fillStyle = bushColor;
      ctx.beginPath();
      ctx.arc(bushX, bushY, bushR, 0, Math.PI * 2);
      ctx.fill();
      // Flowers
      ctx.fillStyle = flowerColor;
      const flowerPositions = [{ dx: 0, dy: 0 }, { dx: -bushR * 0.5, dy: -bushR * 0.3 }, { dx: bushR * 0.5, dy: -bushR * 0.2 }, {dx: bushR*0.3, dy: bushR*0.4}];
      flowerPositions.forEach(pos => {
        ctx.beginPath();
        ctx.arc(bushX + pos.dx, bushY + pos.dy, bushR * 0.2, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    drawBush(x + width * 0.35, y + height * 0.8, height * 0.08, '#556B2F', '#FFD700'); // Dark Olive Green bush, yellow flowers
    drawBush(x + width * 0.65, y + height * 0.82, height * 0.1, '#6B8E23', '#FF69B4'); // Olive Drab bush, hot pink flowers

    // --- Animated Elements Group (Lion + Title) ---
    // Calculate combined height for centering the group if needed, or position individually.
    // Lion will be roughly centered, title above it.

    const currentLionSize = lionBaseSize * scaleFactor;
    const currentTitleFontSize = titleBaseFontSize * scaleFactor;

    // --- Draw Lion ---
    const lionCenterX = centerX;
    const lionCenterY = centerY + height * 0.1 + bounceOffsetY; // Position lion slightly lower than true center

    if (currentLionSize > 1 && currentTitleFontSize > 1) { // Only draw if scaled enough
      // Mane (large, slightly darker circle)
      ctx.fillStyle = '#D2691E'; // Chocolate (for mane)
      ctx.beginPath();
      ctx.arc(lionCenterX, lionCenterY, currentLionSize / 2, 0, Math.PI * 2);
      ctx.fill();

      // Head (smaller, lighter circle on top of mane)
      ctx.fillStyle = '#FFA500'; // Orange (for head)
      ctx.beginPath();
      ctx.arc(lionCenterX, lionCenterY, currentLionSize / 2 * 0.75, 0, Math.PI * 2);
      ctx.fill();

      // Ears
      const earRadius = currentLionSize * 0.15;
      ctx.fillStyle = '#FFA500'; // Orange
      ctx.beginPath();
      ctx.arc(lionCenterX - currentLionSize * 0.3, lionCenterY - currentLionSize * 0.3, earRadius, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(lionCenterX + currentLionSize * 0.3, lionCenterY - currentLionSize * 0.3, earRadius, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#A0522D'; // Sienna (inner ear)
      ctx.beginPath();
      ctx.arc(lionCenterX - currentLionSize * 0.3, lionCenterY - currentLionSize * 0.3, earRadius * 0.6, Math.PI, Math.PI*2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(lionCenterX + currentLionSize * 0.3, lionCenterY - currentLionSize * 0.3, earRadius * 0.6, Math.PI, Math.PI*2);
      ctx.fill();
      
      // Eyes
      ctx.fillStyle = '#FFFFFF'; // White
      const eyeRadius = currentLionSize * 0.1;
      const eyeOffsetX = currentLionSize * 0.15;
      const eyeOffsetY = -currentLionSize * 0.1;
      ctx.beginPath();
      ctx.arc(lionCenterX - eyeOffsetX, lionCenterY + eyeOffsetY, eyeRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(lionCenterX + eyeOffsetX, lionCenterY + eyeOffsetY, eyeRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000000'; // Black (pupils)
      ctx.beginPath();
      ctx.arc(lionCenterX - eyeOffsetX + eyeRadius * 0.2, lionCenterY + eyeOffsetY + eyeRadius * 0.1, eyeRadius * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(lionCenterX + eyeOffsetX + eyeRadius * 0.2, lionCenterY + eyeOffsetY + eyeRadius * 0.1, eyeRadius * 0.5, 0, Math.PI * 2);
      ctx.fill();

      // Muzzle
      ctx.fillStyle = '#FFDAB9'; // Peachpuff
      const muzzleWidth = currentLionSize * 0.4;
      const muzzleHeight = currentLionSize * 0.3;
      ctx.beginPath();
      ctx.ellipse(lionCenterX, lionCenterY + currentLionSize * 0.15, muzzleWidth / 2, muzzleHeight / 2, 0, 0, Math.PI * 2);
      ctx.fill();

      // Nose
      ctx.fillStyle = '#8B0000'; // DarkRed (for nose)
      ctx.beginPath();
      ctx.moveTo(lionCenterX, lionCenterY + currentLionSize * 0.05);
      ctx.lineTo(lionCenterX - currentLionSize * 0.08, lionCenterY + currentLionSize * 0.15);
      ctx.lineTo(lionCenterX + currentLionSize * 0.08, lionCenterY + currentLionSize * 0.15);
      ctx.closePath();
      ctx.fill();

      // Mouth (playful roar/smile)
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = Math.max(1, currentLionSize * 0.02);
      ctx.beginPath();
      ctx.arc(lionCenterX, lionCenterY + currentLionSize * 0.18, currentLionSize * 0.2, 0, Math.PI, false);
      ctx.stroke();
      // Tongue (optional, if mouth is open)
      ctx.fillStyle = '#FF69B4'; // Hotpink
      ctx.beginPath();
      ctx.ellipse(lionCenterX, lionCenterY + currentLionSize * 0.3, currentLionSize * 0.15, currentLionSize * 0.1, 0, 0, Math.PI);
      ctx.fill();

      // --- Draw Title --- (Above the lion)
      const titleY = centerY - height * 0.25 + bounceOffsetY; // Adjusted Y for title position
      
      ctx.font = `bold ${currentTitleFontSize}px 'Comic Sans MS', 'Arial Rounded MT Bold', 'Verdana', sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = Math.max(1, currentTitleFontSize * 0.1);

      const line1 = "Hungry";
      const line2 = "Lion";
      const lineSpacing = currentTitleFontSize * 0.2;
      const totalTitleHeight = currentTitleFontSize * 2 + lineSpacing;
      const titleLine1Y = titleY - totalTitleHeight / 2 + currentTitleFontSize / 2;
      const titleLine2Y = titleLine1Y + currentTitleFontSize + lineSpacing;

      // "Hungry"
      ctx.fillStyle = '#FFD700'; // Gold
      ctx.strokeStyle = '#FFA500'; // Orange
      ctx.strokeText(line1, centerX, titleLine1Y);
      ctx.fillText(line1, centerX, titleLine1Y);

      // "Lion"
      ctx.fillStyle = '#FFA500'; // Orange
      ctx.strokeStyle = '#FF4500'; // OrangeRed
      ctx.strokeText(line2, centerX, titleLine2Y);
      ctx.fillText(line2, centerX, titleLine2Y);
    }
    
    ctx.restore();
  },
};

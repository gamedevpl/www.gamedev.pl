import { CanvasRenderingContext2D } from 'canvas';
import { Asset } from '../assets-types';

// Constants for car dimensions, colors, and rendering configuration
const CAR_CONFIG = {
  // Base dimensions
  WIDTH: 160,
  HEIGHT: 80,
  WHEEL_RADIUS: 15,
  
  // Colors
  BODY_COLOR: '#3498db',
  BODY_SHADOW: '#2980b9',
  WINDOW_COLOR: '#2c3e50',
  WHEEL_COLOR: '#34495e',
  HIGHLIGHT_COLOR: '#ffffff',
  TRIM_COLOR: '#95a5a6',
  
  // Proportions (relative to base dimensions)
  ROOF: {
    WIDTH_RATIO: 0.7,    // Roof width relative to body width
    HEIGHT_RATIO: 0.25,  // Roof height relative to body height
    SLOPE_RATIO: 0.85,   // Roof slope (affects trapezoid shape)
  },
  WINDOW: {
    WIDTH_RATIO: 0.45,   // Window width relative to body width
    HEIGHT_RATIO: 0.3,   // Window height relative to body height
    POSITION_Y: 0.75,    // Vertical position from top
  },
  TRIM: {
    HEIGHT_RATIO: 0.15,  // Trim height relative to body height
    POSITION_Y: 0.6,     // Vertical position from top
  },
  WHEEL: {
    POSITION_X: 0.3,     // Horizontal offset from center
    POSITION_Y: 0.7,     // Vertical position from top
    RIM_WIDTH: 3,        // Width of wheel rim highlight
  },
  HIGHLIGHTS: {
    LINE_WIDTH: 2,
    OPACITY: 0.7,
  },
} as const;

// Helper function for isometric transformations
const applyIsometricTransform = (ctx: CanvasRenderingContext2D): void => {
  ctx.translate(150, 150);  // Center in 300x300 canvas
  ctx.scale(1, 0.5);       // Flatten for isometric look
  ctx.rotate(Math.PI / 4); // 45-degree rotation
};

// Helper function to draw a trapezoid with custom path
const drawTrapezoid = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  topWidth: number,
  bottomWidth: number,
  height: number,
): void => {
  const offsetX = (bottomWidth - topWidth) / 2;
  ctx.beginPath();
  ctx.moveTo(x - bottomWidth / 2, y);
  ctx.lineTo(x + bottomWidth / 2, y);
  ctx.lineTo(x + topWidth / 2 - offsetX, y - height);
  ctx.lineTo(x - topWidth / 2 - offsetX, y - height);
  ctx.closePath();
};

// Helper function to draw a wheel with rim highlight
const drawWheel = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
): void => {
  // Main wheel
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  
  // Rim highlight
  ctx.save();
  ctx.strokeStyle = CAR_CONFIG.HIGHLIGHT_COLOR;
  ctx.lineWidth = CAR_CONFIG.WHEEL.RIM_WIDTH;
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

export const IsometricCar: Asset = {
  name: 'isometric-car',
  description: `# An isometric view of a car
  
Visual style:
- Isometric perspective
- Simplified shapes
- Bright, contrasting colors
- Minimalist design with clear silhouette
- 3D effect achieved through shading and highlights
- Car consists of a body, wheels, windows
- Body has a roof, side windows, and bottom trim
- Front of the car is facing the bottom right corner

Technical requirements:
- Dimensions: 300x300 pixels
- Must be implemented using only simple geometric shapes
- Implementation must be contained entirely within the 'render' function
- Order of rendering shapes should create the correct layering for the car
`,

  render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    applyIsometricTransform(ctx);
    
    // Calculate dimensions based on config ratios
    const roofWidth = CAR_CONFIG.WIDTH * CAR_CONFIG.ROOF.WIDTH_RATIO;
    const roofHeight = CAR_CONFIG.HEIGHT * CAR_CONFIG.ROOF.HEIGHT_RATIO;
    const windowWidth = CAR_CONFIG.WIDTH * CAR_CONFIG.WINDOW.WIDTH_RATIO;
    const windowHeight = CAR_CONFIG.HEIGHT * CAR_CONFIG.WINDOW.HEIGHT_RATIO;
    
    // Draw car body (main block)
    ctx.fillStyle = CAR_CONFIG.BODY_COLOR;
    ctx.beginPath();
    ctx.rect(
      -CAR_CONFIG.WIDTH / 2,
      -CAR_CONFIG.HEIGHT / 2,
      CAR_CONFIG.WIDTH,
      CAR_CONFIG.HEIGHT
    );
    ctx.fill();
    
    // Draw roof with improved trapezoid shape
    ctx.fillStyle = CAR_CONFIG.BODY_SHADOW;
    drawTrapezoid(
      ctx,
      0,
      -CAR_CONFIG.HEIGHT / 2,
      roofWidth * CAR_CONFIG.ROOF.SLOPE_RATIO,
      roofWidth,
      roofHeight
    );
    ctx.fill();
    
    // Draw windows with adjusted size and position
    ctx.fillStyle = CAR_CONFIG.WINDOW_COLOR;
    ctx.beginPath();
    ctx.rect(
      -windowWidth / 2,
      -CAR_CONFIG.HEIGHT * CAR_CONFIG.WINDOW.POSITION_Y,
      windowWidth,
      windowHeight
    );
    ctx.fill();
    
    // Draw bottom trim
    ctx.fillStyle = CAR_CONFIG.TRIM_COLOR;
    ctx.fillRect(
      -CAR_CONFIG.WIDTH / 2,
      CAR_CONFIG.HEIGHT * CAR_CONFIG.TRIM.POSITION_Y,
      CAR_CONFIG.WIDTH,
      CAR_CONFIG.HEIGHT * CAR_CONFIG.TRIM.HEIGHT_RATIO
    );
    
    // Draw wheels with rim highlights
    ctx.fillStyle = CAR_CONFIG.WHEEL_COLOR;
    const wheelX = CAR_CONFIG.WIDTH * CAR_CONFIG.WHEEL.POSITION_X;
    const wheelY = CAR_CONFIG.HEIGHT * CAR_CONFIG.WHEEL.POSITION_Y;
    drawWheel(ctx, wheelX, wheelY, CAR_CONFIG.WHEEL_RADIUS);    // Front wheel
    drawWheel(ctx, -wheelX, wheelY, CAR_CONFIG.WHEEL_RADIUS);   // Back wheel
    
    // Add refined highlights with improved opacity
    ctx.strokeStyle = CAR_CONFIG.HIGHLIGHT_COLOR;
    ctx.lineWidth = CAR_CONFIG.HIGHLIGHTS.LINE_WIDTH;
    ctx.globalAlpha = CAR_CONFIG.HIGHLIGHTS.OPACITY;
    
    // Roof highlight
    ctx.beginPath();
    ctx.moveTo(-roofWidth / 2, -CAR_CONFIG.HEIGHT / 2);
    ctx.lineTo(roofWidth / 2, -CAR_CONFIG.HEIGHT / 2);
    ctx.stroke();
    
    // Side highlights
    ctx.beginPath();
    ctx.moveTo(-CAR_CONFIG.WIDTH / 2, -CAR_CONFIG.HEIGHT * 0.3);
    ctx.lineTo(CAR_CONFIG.WIDTH / 2, -CAR_CONFIG.HEIGHT * 0.3);
    ctx.moveTo(-CAR_CONFIG.WIDTH / 2, CAR_CONFIG.HEIGHT * 0.2);
    ctx.lineTo(CAR_CONFIG.WIDTH / 2, CAR_CONFIG.HEIGHT * 0.2);
    ctx.stroke();
    
    ctx.restore();
  },
};
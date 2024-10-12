import { EDGE_RADIUS } from '../../consts';

// Define colors for terrain elements
const COLORS = {
  grass: '#6B8E23', // Less saturated green for grass
  dirt: '#D2B48C', // Dirt color
};

// Function to generate terrain using a simple heightmap based on a sinusoidal pattern
function generateTerrainWithHeightMap(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  tileSize: number,
) {
  const gridWidth = Math.ceil(canvasWidth / tileSize);
  const gridHeight = Math.ceil(canvasHeight / tileSize);
  const heightMap: number[][] = Array.from({ length: gridHeight + 1 }, () => Array(gridWidth + 1).fill(0));

  // Create a simple sinusoidal heightmap
  for (let y = 0; y <= gridHeight; y++) {
    for (let x = 0; x <= gridWidth; x++) {
      heightMap[y][x] =
        (Math.sin((x / gridWidth) * 2 * Math.PI * 2) * 0.25 + Math.cos((y / gridHeight) * Math.PI * 2) * 0.25) *
        tileSize;
    }
  }

  // Draw the terrain based on the heightmap
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      // Get the height values for the four corners of the current tile
      const heightTopLeft = heightMap[y][x];
      const heightTopRight = heightMap[y][x + 1];
      const heightBottomLeft = heightMap[y + 1][x];
      const heightBottomRight = heightMap[y + 1][x + 1];

      // Calculate the adjusted y positions based on height values
      const topLeftY = y * tileSize - heightTopLeft;
      const topRightY = y * tileSize - heightTopRight;
      const bottomLeftY = (y + 1) * tileSize - heightBottomLeft;
      const bottomRightY = (y + 1) * tileSize - heightBottomRight;

      // Calculate the average height for shading
      // const averageHeight = (heightTopLeft + heightTopRight + heightBottomLeft + heightBottomRight) / 4;
      const rotationAngle = Math.atan2(heightBottomRight - heightTopLeft, heightBottomLeft - heightTopRight); // Simulated light angle for shading

      // Apply shading to the color
      const baseColor = COLORS.grass;
      const shadedColor = applyShading(baseColor, rotationAngle);

      // Draw the tile using a path to represent height variations
      ctx.beginPath();
      ctx.moveTo(x * tileSize, topLeftY);
      ctx.lineTo((x + 1) * tileSize, topRightY);
      ctx.lineTo((x + 1) * tileSize, bottomRightY);
      ctx.lineTo(x * tileSize, bottomLeftY);
      ctx.closePath();

      // Set the fill color with shading
      ctx.fillStyle = shadedColor;
      ctx.fill();
    }
  }

  return heightMap;
}

// Function to apply shading to a color, similar to the unit shading function
function applyShading(color: string, rotationAngle: number, alpha: number = 1): string {
  const shade = Math.cos(rotationAngle) * 0.3 + 0.7; // Value between 0.4 and 1
  const rgb = parseInt(color.slice(1), 16);
  const r = Math.floor(((rgb >> 16) & 255) * shade);
  const g = Math.floor(((rgb >> 8) & 255) * shade);
  const b = Math.floor((rgb & 255) * shade);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Main function to generate terrain texture
export function generateTerrainTexture(tileSize: number): { canvas: HTMLCanvasElement; heightMap: number[][] } {
  const canvas = document.createElement('canvas');
  canvas.width = EDGE_RADIUS * 3;
  canvas.height = EDGE_RADIUS * 2;
  const ctx = canvas.getContext('2d')!;

  // Generate terrain with a sinusoidal heightmap
  const heightMap = generateTerrainWithHeightMap(ctx, canvas.width, canvas.height, tileSize);

  return { canvas, heightMap };
}

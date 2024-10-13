// Define colors for terrain elements
const COLORS = {
  grass: '#6B8E23', // Less saturated green for grass
  dirt: '#8C8D7B', // Dirt color
};

// Function to apply shading to a color
function applyShading(color: string, rotationAngle: number, height: number, alpha: number = 1): string {
  // Adjust shading based on height and rotation angle
  const heightFactor = Math.min(Math.max(height / 50, 0), 1); // Normalize height to 0-1 range
  const shade = (Math.cos(rotationAngle) * 0.3 + 0.7) * (0.8 + heightFactor * 0.4); // Adjust shading based on height
  const rgb = parseInt(color.slice(1), 16);
  const r = Math.floor(((rgb >> 16) & 255) * shade);
  const g = Math.floor(((rgb >> 8) & 255) * shade);
  const b = Math.floor((rgb & 255) * shade);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Helper function to calculate normal vector for a terrain tile
function calculateNormal(heightMap: number[][], x: number, y: number, tileSize: number): [number, number, number] {
  const h = heightMap[y][x];
  const hRight = heightMap[y][Math.min(x + 1, heightMap[0].length - 1)];
  const hDown = heightMap[Math.min(y + 1, heightMap.length - 1)][x];

  const dx = [tileSize, 0, hRight - h];
  const dy = [0, tileSize, hDown - h];

  // Calculate cross product
  const normal: [number, number, number] = [
    dy[1] * dx[2] - dy[2] * dx[1],
    dy[2] * dx[0] - dy[0] * dx[2],
    dy[0] * dx[1] - dy[1] * dx[0],
  ];

  // Normalize the vector
  const length = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]);
  return [normal[0] / length, normal[1] / length, normal[2] / length];
}

// Function to render terrain based on heightmap
export function renderTerrain(
  ctx: CanvasRenderingContext2D,
  heightMap: number[][],
  width: number,
  height: number,
  tileSize: number,
): void {
  const gridWidth = Math.ceil(width / tileSize);
  const gridHeight = Math.ceil(height / tileSize);

  // Draw the terrain based on the heightmap
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      // Get the height values for the four corners of the current tile
      const heightTopLeft = heightMap[y][x];
      const heightTopRight = heightMap[y][x + 1] || heightTopLeft;
      const heightBottomLeft = heightMap[y + 1]?.[x] || heightTopLeft;
      const heightBottomRight = heightMap[y + 1]?.[x + 1] || heightTopRight;

      // Calculate the adjusted y positions based on height values
      const topLeftY = y * tileSize - heightTopLeft;
      const topRightY = y * tileSize - heightTopRight;
      const bottomLeftY = (y + 1) * tileSize - heightBottomLeft;
      const bottomRightY = (y + 1) * tileSize - heightBottomRight;

      // Calculate the normal vector for shading
      const normal = calculateNormal(heightMap, x, y, tileSize);
      const rotationAngle = Math.atan2(normal[1], normal[0]);

      // Determine the base color based on height
      const averageHeight = (heightTopLeft + heightTopRight + heightBottomLeft + heightBottomRight) / 4;
      const factor = Math.min(Math.max(averageHeight / 50, 0), 1); // Normalize averageHeight to 0-1 range
      const baseColor = interpolateColor(COLORS.grass, COLORS.dirt, factor);

      // Apply shading to the color
      const shadedColor = applyShading(baseColor, rotationAngle, averageHeight);

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
}

// Function to create a terrain texture
export function createTerrainTexture(
  width: number,
  height: number,
  heightMap: number[][],
  tileSize: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  renderTerrain(ctx, heightMap, width, height, tileSize);

  return canvas;
}

const interpolateColor = (color1: string, color2: string, factor: number): string => {
  const hex = (color: string) => parseInt(color.slice(1), 16);
  const r1 = (hex(color1) >> 16) & 255;
  const g1 = (hex(color1) >> 8) & 255;
  const b1 = hex(color1) & 255;
  const r2 = (hex(color2) >> 16) & 255;
  const g2 = (hex(color2) >> 8) & 255;
  const b2 = hex(color2) & 255;

  const r = Math.round(r1 + factor * (r2 - r1));
  const g = Math.round(g1 + factor * (g2 - g1));
  const b = Math.round(b1 + factor * (b2 - b1));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

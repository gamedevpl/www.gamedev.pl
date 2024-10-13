// Define colors for terrain elements
const COLORS = {
  grass: '#6B8E23', // Less saturated green for grass
  dirt: '#D2B48C', // Dirt color
};

// Function to apply shading to a color
function applyShading(color: string, rotationAngle: number, alpha: number = 1): string {
  const shade = Math.cos(rotationAngle) * 0.3 + 0.7; // Value between 0.4 and 1
  const rgb = parseInt(color.slice(1), 16);
  const r = Math.floor(((rgb >> 16) & 255) * shade);
  const g = Math.floor(((rgb >> 8) & 255) * shade);
  const b = Math.floor((rgb & 255) * shade);
  return `rgba(${r},${g},${b},${alpha})`;
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
      const heightTopRight = heightMap[y][x + 1];
      const heightBottomLeft = heightMap[y + 1][x];
      const heightBottomRight = heightMap[y + 1][x + 1];

      // Calculate the adjusted y positions based on height values
      const topLeftY = y * tileSize - heightTopLeft;
      const topRightY = y * tileSize - heightTopRight;
      const bottomLeftY = (y + 1) * tileSize - heightBottomLeft;
      const bottomRightY = (y + 1) * tileSize - heightBottomRight;

      // Calculate the rotation angle for shading
      const rotationAngle = Math.atan2(heightBottomRight - heightTopLeft, heightBottomLeft - heightTopRight);

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

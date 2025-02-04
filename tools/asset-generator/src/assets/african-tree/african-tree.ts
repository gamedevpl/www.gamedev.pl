import { CanvasRenderingContext2D } from 'canvas';
import { Asset } from '../assets-types';

// Configuration for the African tree appearance and behavior
const TREE_CONFIG = {
  // Base dimensions
  WIDTH_RATIO: 0.8,           // Tree width relative to canvas
  HEIGHT_RATIO: 0.8,          // Tree height relative to canvas
  POSITION_X_RATIO: 0.1,      // Horizontal position from left
  POSITION_Y_RATIO: 0.2,      // Vertical position from top

  // Trunk settings
  TRUNK: {
    WIDTH_RATIO: 0.15,        // Trunk width relative to tree width
    HEIGHT_RATIO: 0.4,        // Trunk height relative to tree height
    CURVE_FACTOR: 0.05,       // Factor for trunk curvature
    COLOR: '#4B3621',         // Base trunk color
    DETAIL_COLOR: '#3A2A1A',  // Bark detail color
    DETAIL_COUNT: 8,          // Number of bark detail lines
    DETAIL_VARIANCE: 0.15,    // Variance in bark detail spacing
  },

  // Canopy settings
  CANOPY: {
    COLOR: '#2D5A27',         // Primary canopy color
    DETAIL_COLOR: '#1E3D1C',  // Secondary canopy color
    SHADOW_COLOR: '#1A2F15',  // Deep shadow color
    LAYERS: 4,                // Number of main canopy layers
    OVERLAP: 0.25,            // Overlap between layers
    DETAIL_CLUSTERS: 5,       // Number of detail clusters
    DETAILS_PER_CLUSTER: 3,   // Details in each cluster
  }
} as const;

export const AfricanTree: Asset = {
  name: 'african-tree',
  description: 'African tree with a large canopy and a thick trunk.',

  render(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    // Calculate base dimensions
    const width = ctx.canvas.width * TREE_CONFIG.WIDTH_RATIO;
    const height = ctx.canvas.height * TREE_CONFIG.HEIGHT_RATIO;
    const x = ctx.canvas.width * TREE_CONFIG.POSITION_X_RATIO;
    const y = ctx.canvas.height * TREE_CONFIG.POSITION_Y_RATIO;

    const renderTrunk = () => {
      const { TRUNK } = TREE_CONFIG;
      const trunkWidth = width * TRUNK.WIDTH_RATIO;
      const trunkHeight = height * TRUNK.HEIGHT_RATIO;
      const trunkX = x + (width - trunkWidth) / 2;
      const trunkY = y + height - trunkHeight;

      // Draw curved trunk
      ctx.fillStyle = TRUNK.COLOR;
      ctx.beginPath();
      ctx.moveTo(trunkX, trunkY + trunkHeight);
      ctx.lineTo(trunkX + trunkWidth, trunkY + trunkHeight);

      // Curved sides for more natural look
      ctx.bezierCurveTo(
        trunkX + trunkWidth + (trunkWidth * TRUNK.CURVE_FACTOR),
        trunkY + trunkHeight * 0.6,
        trunkX + trunkWidth * 0.9,
        trunkY + trunkHeight * 0.3,
        trunkX + (trunkWidth * 0.85),
        trunkY
      );
      ctx.lineTo(trunkX + (trunkWidth * 0.15), trunkY);
      ctx.bezierCurveTo(
        trunkX + trunkWidth * 0.1,
        trunkY + trunkHeight * 0.3,
        trunkX - (trunkWidth * TRUNK.CURVE_FACTOR),
        trunkY + trunkHeight * 0.6,
        trunkX,
        trunkY + trunkHeight
      );
      ctx.fill();

      // Enhanced bark texture
      ctx.strokeStyle = TRUNK.DETAIL_COLOR;
      ctx.lineWidth = 1;
      for (let i = 0; i < TRUNK.DETAIL_COUNT; i++) {
        const progress = i / (TRUNK.DETAIL_COUNT - 1);
        const yPos = trunkY + (trunkHeight * progress);
        const variance = Math.sin(progress * Math.PI) * TRUNK.DETAIL_VARIANCE;
        const curveControl = trunkX + trunkWidth / 2;

        ctx.beginPath();
        ctx.moveTo(trunkX + trunkWidth * 0.1, yPos);
        ctx.quadraticCurveTo(
          curveControl + (variance * trunkWidth),
          yPos + (variance * trunkHeight * 0.1),
          trunkX + trunkWidth * 0.9,
          yPos
        );
        ctx.stroke();
      }
    };

    const renderCanopy = () => {
      const { CANOPY } = TREE_CONFIG;
      const canopyHeight = height * (1 - TREE_CONFIG.TRUNK.HEIGHT_RATIO);
      const layerHeight = canopyHeight / CANOPY.LAYERS;

      // Draw main canopy layers with enhanced depth
      for (let i = 0; i < CANOPY.LAYERS; i++) {
        const layerY = y + (i * layerHeight * (1 - CANOPY.OVERLAP));
        const layerWidth = width * (1 - (i * 0.15));
        const layerX = x + (width - layerWidth) / 2;

        // Alternate between three shades for more depth
        ctx.fillStyle = i % 3 === 0 ? CANOPY.COLOR :
                       i % 3 === 1 ? CANOPY.DETAIL_COLOR :
                       CANOPY.SHADOW_COLOR;

        ctx.beginPath();
        ctx.moveTo(layerX, layerY + layerHeight);
        
        // Enhanced curve for more natural canopy shape
        ctx.bezierCurveTo(
          layerX + layerWidth * 0.2,
          layerY + layerHeight * 0.3,
          layerX + layerWidth * 0.8,
          layerY - layerHeight * 0.2,
          layerX + layerWidth,
          layerY + layerHeight
        );
        ctx.fill();
      }

      // Clustered canopy details for more natural appearance
      ctx.fillStyle = CANOPY.DETAIL_COLOR;
      for (let cluster = 0; cluster < CANOPY.DETAIL_CLUSTERS; cluster++) {
        const centerX = x + (Math.random() * width);
        const centerY = y + (Math.random() * canopyHeight);

        for (let detail = 0; detail < CANOPY.DETAILS_PER_CLUSTER; detail++) {
          const angle = (Math.PI * 2 * detail) / CANOPY.DETAILS_PER_CLUSTER;
          const distance = Math.random() * (width * 0.08);
          const detailX = centerX + Math.cos(angle) * distance;
          const detailY = centerY + Math.sin(angle) * distance;
          const detailSize = width * (0.03 + Math.random() * 0.03);

          ctx.beginPath();
          ctx.ellipse(
            detailX,
            detailY,
            detailSize,
            detailSize * 0.8,
            angle,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }
    };

    renderCanopy();
    renderTrunk();

    ctx.restore();
  }
};
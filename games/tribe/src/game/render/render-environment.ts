import { EnvironmentalObject } from '../environment/environment-types';
import { getImageAsset } from '../assets/image-loader';

/**
 * Renders environmental objects (trees, rocks, flowers)
 */
export function renderEnvironmentalObject(
  ctx: CanvasRenderingContext2D,
  object: EnvironmentalObject,
): void {
  const asset = getImageAsset(object.imageType);
  
  if (asset) {
    // Draw the environmental object sprite
    ctx.drawImage(
      asset.image,
      object.position.x - object.width / 2,
      object.position.y - object.height / 2,
      object.width,
      object.height,
    );
  } else {
    // Fallback rendering if asset not loaded
    ctx.save();
    
    switch (object.type) {
      case 'tree':
        // Simple fallback tree
        ctx.fillStyle = '#8B4513'; // Brown trunk
        ctx.fillRect(
          object.position.x - 4,
          object.position.y + 10,
          8,
          object.height / 2,
        );
        ctx.fillStyle = '#228B22'; // Green foliage
        ctx.beginPath();
        ctx.arc(object.position.x, object.position.y - 10, object.width / 3, 0, Math.PI * 2);
        ctx.fill();
        break;
        
      case 'rock':
        // Simple fallback rock
        ctx.fillStyle = '#808080';
        ctx.beginPath();
        ctx.ellipse(
          object.position.x,
          object.position.y,
          object.width / 2,
          object.height / 2,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        break;
        
      case 'flower':
        // Simple fallback flower
        ctx.fillStyle = '#FFB6C1';
        ctx.beginPath();
        ctx.arc(object.position.x, object.position.y, object.width / 3, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
    
    ctx.restore();
  }
}
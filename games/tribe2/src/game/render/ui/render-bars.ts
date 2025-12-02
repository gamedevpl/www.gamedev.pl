import { FoodItem, FOOD_TYPE_EMOJIS } from '../../food/food-types';

export function drawProgressBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number, // 0 to 1
  backgroundColor: string,
  foregroundColor: string,
): void {
  ctx.save();
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = foregroundColor;
  ctx.fillRect(x, y, width * Math.max(0, progress), height);
  ctx.restore();
}

export function drawFoodBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  foodItems: FoodItem[],
  iconSize: number,
  maxWidth: number,
): void {
  ctx.save();

  if (foodItems.length === 0) {
    ctx.restore();
    return;
  }

  const totalIconWidth = foodItems.length * iconSize;
  let padding: number;

  if (totalIconWidth > maxWidth) {
    padding = (maxWidth - totalIconWidth) / (foodItems.length - 1);
  } else {
    const defaultPadding = 4;
    const totalWidthWithDefaultPadding = totalIconWidth + (foodItems.length - 1) * defaultPadding;
    if (totalWidthWithDefaultPadding > maxWidth) {
      padding = (maxWidth - totalIconWidth) / (foodItems.length - 1);
    } else {
      padding = defaultPadding;
    }
  }

  if (foodItems.length === 1) {
    padding = 0;
  }

  for (let i = 0; i < foodItems.length; i++) {
    const emoji = FOOD_TYPE_EMOJIS[foodItems[i].type];
    ctx.fillText(emoji, x + i * (iconSize + padding), y);
  }
  ctx.restore();
}

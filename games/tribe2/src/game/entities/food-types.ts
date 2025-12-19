export enum FoodType {
  Berry = 'berry',
  Meat = 'meat',
}

export interface FoodItem {
  itemType: 'food';
  type: FoodType;
}

export const FOOD_TYPE_EMOJIS: Record<FoodType, string> = {
  [FoodType.Berry]: '🍓',
  [FoodType.Meat]: '🥩',
};

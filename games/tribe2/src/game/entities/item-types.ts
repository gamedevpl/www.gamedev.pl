export enum ItemType {
  Wood = 'wood',
}

export interface Item {
  itemType: 'item';
  type: ItemType;
}

export interface WoodItem extends Item {
  type: ItemType.Wood;
}

export const ITEM_TYPE_EMOJIS: Record<ItemType, string> = {
  [ItemType.Wood]: '🪵',
};

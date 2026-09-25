export const RASTER_ASSET_BUDGET_BYTES = 24 * 1024 * 1024;

export const RASTER_ASSET_MAX_FILE_BYTES = 3 * 1024 * 1024;

export const IMAGES_CONTRACT = {
  manifestField: 'images',
  windowAssetsName: '__GAME_IMAGE_ASSETS__',
  windowElementsName: '__GAME_IMAGE_ELEMENTS__',
  windowProgressName: '__GAME_IMAGE_PROGRESS__',
} as const;

export { DELIVERY_EXTRA_ASSET_PATTERN } from '@gamedevpl/contract';

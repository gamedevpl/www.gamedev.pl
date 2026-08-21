// Catalog entry descriptors shared by the games-repo bake, API, and web.
export const CATALOG_ORIENTATIONS = ['any', 'portrait', 'landscape', 'adaptive'] as const;

export type CatalogOrientation = (typeof CATALOG_ORIENTATIONS)[number];

export const CATALOG_TOUCH_VALUES = ['gamekit', 'native', 'controllers', 'none'] as const;

export type CatalogTouch = (typeof CATALOG_TOUCH_VALUES)[number];

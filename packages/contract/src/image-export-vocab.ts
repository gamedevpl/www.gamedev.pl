// Shell-saved game photo: prompt shown, then its outcome. No filename.
export const IMAGE_EXPORT_STEPS = ['requested', 'saved', 'dismissed', 'failed', 'rejected'] as const;
export type ImageExportStep = (typeof IMAGE_EXPORT_STEPS)[number];

// Shell-saved game video clip: same steps, counted apart from photos.
export const VIDEO_EXPORT_STEPS = IMAGE_EXPORT_STEPS;
export type VideoExportStep = ImageExportStep;

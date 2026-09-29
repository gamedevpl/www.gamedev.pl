// Shell-saved game photo: prompt shown, then its outcome. No filename.
export const IMAGE_EXPORT_STEPS = ['requested', 'saved', 'dismissed', 'failed', 'rejected'] as const;
export type ImageExportStep = (typeof IMAGE_EXPORT_STEPS)[number];

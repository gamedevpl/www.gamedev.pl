// Shell-saved game photo: prompt shown, then its outcome. No filename.
export const IMAGE_EXPORT_STEPS = ['requested', 'saved', 'dismissed', 'rejected'] as const;
export type ImageExportStep = (typeof IMAGE_EXPORT_STEPS)[number];

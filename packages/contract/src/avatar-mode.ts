// Where a creator's avatar picture comes from.
export const AVATAR_MODES = ['google', 'letter'] as const;
export type AvatarMode = (typeof AVATAR_MODES)[number];

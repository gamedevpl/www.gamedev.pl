export const VOTE_VALUES = ['up', 'down'] as const;
export type VoteValue = (typeof VOTE_VALUES)[number];

export const CONTRIBUTION_MODES = ['off', 'review'] as const;
export type ContributionMode = (typeof CONTRIBUTION_MODES)[number];

// Per-game player remix switch; unset reads as 'on'.
export const REMIX_MODES = ['on', 'off'] as const;
export type RemixMode = (typeof REMIX_MODES)[number];

// A closed-beta waitlist record's persisted status.
export const WAITLIST_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

export const BETA_INVITE_STATUSES = ['available', 'claimed', 'revoked'] as const;
export type BetaInviteStatus = (typeof BETA_INVITE_STATUSES)[number];

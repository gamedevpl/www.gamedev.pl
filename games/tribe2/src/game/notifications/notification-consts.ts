// Notification Constants

export const NOTIFICATION_DURATION_MEDIUM_HOURS: number = 12; // e.g., for starving children warning
export const NOTIFICATION_DURATION_LONG_HOURS: number = 24; // e.g., for new tribe formed
export const CHILD_HUNGER_THRESHOLD_FOR_NOTIFICATION: number = 150 * 0.9; // At 90% hunger (HUMAN_HUNGER_DEATH * 0.9)
export const NOTIFICATION_DISMISS_COOLDOWN_HOURS: number = 24; // Cooldown before a dismissed notification can reappear
import { DialogueText, DIALOGUE_CONSTANTS, Santa, SANTA_PHYSICS } from '../game-world/game-world-types';

// Dialogue pools for different events
const HIT_DIALOGUES = [
  "Is that all you've got?",
  'That tickled!',
  'Ho-ho-OUCH!',
  'My beard is singed!',
  'Coal for you next year!',
  "That's not very Christmas-y!",
  "I've had worse chimney burns!",
  'Rudolph hits harder!',
];

const LOW_ENERGY_DIALOGUES = [
  'Running on empty...',
  'Need milk and cookies...',
  'Coffee break time?',
  'Too old for this...',
  "Should've taken the sleigh",
  'Elf union was right...',
  'Time for vacation...',
];

const MAX_ENERGY_DIALOGUES = [
  "Now we're talking!",
  "Ho ho ho, let's go!",
  'Feeling jolly!',
  "Santa's got the power!",
  'Better than reindeer power!',
  'North Pole energy!',
  'Who needs elves?',
];

const ELIMINATION_DIALOGUES = [
  'Back to the North Pole...',
  "Mrs. Claus won't like this...",
  'Presents... must... deliver...',
  'Christmas is cancelled...',
  "Should've stayed with the elves...",
];

/**
 * Generate a unique ID for dialogues
 */
function generateDialogueId(): string {
  return `dialogue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Pick a random dialogue from the pool
 */
function getRandomDialogue(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Create a new dialogue text object
 */
function createDialogue(
  text: string,
  currentTime: number,
  duration = DIALOGUE_CONSTANTS.DISPLAY_DURATION,
): DialogueText {
  return {
    id: generateDialogueId(),
    text,
    createdAt: currentTime,
    duration,
    fadeInDuration: DIALOGUE_CONSTANTS.FADE_IN_DURATION,
    fadeOutDuration: DIALOGUE_CONSTANTS.FADE_OUT_DURATION,
    opacity: 0,
  };
}

/**
 * Check if a Santa can display a new dialogue
 */
function canShowDialogue(santa: Santa, currentTime: number): boolean {
  return (
    (!santa.lastDialogueTime || currentTime - santa.lastDialogueTime >= DIALOGUE_CONSTANTS.DIALOGUE_COOLDOWN) &&
    santa.dialogues.length < DIALOGUE_CONSTANTS.MAX_CONCURRENT_DIALOGUES
  );
}

/**
 * Add a dialogue to Santa's dialogue list
 */
export function addDialogue(santa: Santa, text: string, currentTime: number): void {
  if (!canShowDialogue(santa, currentTime)) {
    return;
  }

  const dialogue = createDialogue(text, currentTime);
  santa.dialogues.push(dialogue);
  santa.lastDialogueTime = currentTime;
}

/**
 * Handle hit event dialogue
 */
export function triggerHitDialogue(santa: Santa, currentTime: number): void {
  const dialogue = getRandomDialogue(HIT_DIALOGUES);
  addDialogue(santa, dialogue, currentTime);
}

/**
 * Handle low energy dialogue
 */
export function triggerLowEnergyDialogue(santa: Santa, currentTime: number): void {
  if (santa.energy <= SANTA_PHYSICS.MAX_ENERGY * (DIALOGUE_CONSTANTS.LOW_ENERGY_THRESHOLD / 100)) {
    const dialogue = getRandomDialogue(LOW_ENERGY_DIALOGUES);
    addDialogue(santa, dialogue, currentTime);
  }
}

/**
 * Handle max energy dialogue
 */
export function triggerMaxEnergyDialogue(santa: Santa, currentTime: number): void {
  if (santa.energy >= SANTA_PHYSICS.MAX_ENERGY) {
    const dialogue = getRandomDialogue(MAX_ENERGY_DIALOGUES);
    addDialogue(santa, dialogue, currentTime);
  }
}

/**
 * Handle elimination dialogue
 */
export function triggerEliminationDialogue(santa: Santa, currentTime: number): void {
  const dialogue = getRandomDialogue(ELIMINATION_DIALOGUES);
  // Longer duration for elimination dialogue
  const eliminationDialogue = createDialogue(dialogue, currentTime, DIALOGUE_CONSTANTS.DISPLAY_DURATION * 1.5);
  santa.dialogues.push(eliminationDialogue);
  santa.lastDialogueTime = currentTime;
}

/**
 * Update dialogue states (opacity, removal of expired dialogues)
 */
export function updateDialogues(santa: Santa, currentTime: number): void {
  santa.dialogues = santa.dialogues.filter((dialogue) => {
    const age = currentTime - dialogue.createdAt;

    // Remove expired dialogues
    if (age >= dialogue.duration + dialogue.fadeOutDuration) {
      return false;
    }

    // Update opacity based on age
    if (age < dialogue.fadeInDuration) {
      // Fade in
      dialogue.opacity = age / dialogue.fadeInDuration;
    } else if (age > dialogue.duration) {
      // Fade out
      const fadeOutProgress = (age - dialogue.duration) / dialogue.fadeOutDuration;
      dialogue.opacity = 1 - fadeOutProgress;
    } else {
      // Fully visible
      dialogue.opacity = 1;
    }

    return true;
  });
}

/**
 * Clear all dialogues for a Santa
 */
export function clearDialogues(santa: Santa): void {
  santa.dialogues = [];
}

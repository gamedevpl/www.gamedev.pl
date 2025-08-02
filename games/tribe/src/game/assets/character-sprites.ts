import { ImageType } from './image-types';

// Define mapping from character stance and gender to appropriate sprite
export function getCharacterSpriteType(
  stance: string,
  gender: 'male' | 'female',
): ImageType {
  // Handle dead characters
  if (stance === 'dead' || stance === 'stunned') {
    return ImageType.CharacterDead;
  }

  // Map stance to sprite type based on gender
  switch (stance) {
    case 'idle':
    case 'procreate': // Use idle pose for procreation base
      return gender === 'male' ? ImageType.MaleCharacterIdle : ImageType.FemaleCharacterIdle;
      
    case 'walk':
    case 'moving':
      return gender === 'male' ? ImageType.MaleCharacterWalk : ImageType.FemaleCharacterWalk;
      
    case 'gathering':
    case 'planting':
      return gender === 'male' ? ImageType.MaleCharacterGathering : ImageType.FemaleCharacterGathering;
      
    case 'eat':
    case 'feeding':
      return gender === 'male' ? ImageType.MaleCharacterEating : ImageType.FemaleCharacterEating;
      
    case 'attacking':
      return gender === 'male' ? ImageType.MaleCharacterAttacking : ImageType.FemaleCharacterAttacking;
      
    default:
      // Default to idle pose
      return gender === 'male' ? ImageType.MaleCharacterIdle : ImageType.FemaleCharacterIdle;
  }
}

// Function to apply character transformations based on direction
export function shouldFlipCharacterSprite(direction: { x: number; y: number }): boolean {
  // Flip horizontally if character is facing left
  return direction.x < 0;
}

// Function to get character scale based on age and adult status
export function getCharacterSpriteScale(age: number, isAdult: boolean): number {
  const baseScale = isAdult ? 1.0 : 0.6; // Children are smaller
  
  // Slightly adjust scale based on age for adults
  if (isAdult) {
    const ageScale = 0.9 + (Math.min(age, 60) / 60) * 0.2; // Scale from 0.9 to 1.1
    return baseScale * ageScale;
  }
  
  return baseScale;
}
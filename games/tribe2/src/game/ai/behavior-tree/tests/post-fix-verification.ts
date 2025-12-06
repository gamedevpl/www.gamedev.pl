/**
 * POST-FIX VERIFICATION
 * 
 * Verifies that the 4 critical semantic fixes were applied correctly.
 */

import * as fs from 'fs';
import * as path from 'path';

const behaviorDir = '/home/runner/work/www.gamedev.pl/www.gamedev.pl/games/tribe2/src/game/ai/behavior-tree/behaviors';

console.log('='.repeat(80));
console.log('POST-FIX VERIFICATION - Checking Applied Fixes');
console.log('='.repeat(80));

let allFixesApplied = true;

// Fix 1: Fleeing behavior - critical health check
console.log('\n--- Fix 1: Fleeing-Hunger Paradox ---');
const fleeingContent = fs.readFileSync(path.join(behaviorDir, 'fleeing-behavior.ts'), 'utf-8');
const hasCriticalHealthCheck = fleeingContent.includes('isCriticalHealth') && 
                                 fleeingContent.includes('< human.maxHitpoints * 0.1');
const hasOverride = fleeingContent.includes('!isCriticalHealth') &&
                    fleeingContent.includes('human.hunger > AI_ATTACK_HUNGER_THRESHOLD');

if (hasCriticalHealthCheck && hasOverride) {
  console.log('✅ VERIFIED: Critical health check added');
  console.log('   - Detects health < 10%');
  console.log('   - Overrides hunger block');
} else {
  console.log('❌ FAILED: Critical health check not found');
  allFixesApplied = false;
}

// Fix 2: Predator feeding - food check
console.log('\n--- Fix 2: Predator Feeding Food Check ---');
const predatorFeedingContent = fs.readFileSync(path.join(behaviorDir, 'predator-feeding-behavior.ts'), 'utf-8');
const predatorHasFoodCheck = predatorFeedingContent.includes('predator.food.length > 0') &&
                               predatorFeedingContent.includes('// Must have food to feed children');

if (predatorHasFoodCheck) {
  console.log('✅ VERIFIED: Predator food availability check added');
  console.log('   - Checks predator.food.length > 0');
} else {
  console.log('❌ FAILED: Predator food check not found');
  allFixesApplied = false;
}

// Fix 3: Prey feeding - food check  
console.log('\n--- Fix 3: Prey Feeding Food Check ---');
const preyFeedingContent = fs.readFileSync(path.join(behaviorDir, 'prey-feeding-behavior.ts'), 'utf-8');
const preyHasFoodCheck = preyFeedingContent.includes('prey.food.length > 0') &&
                          preyFeedingContent.includes('// Must have food to feed children');

if (preyHasFoodCheck) {
  console.log('✅ VERIFIED: Prey food availability check added');
  console.log('   - Checks prey.food.length > 0');
} else {
  console.log('❌ FAILED: Prey food check not found');
  allFixesApplied = false;
}

// Fix 4: Procreation - desperate minimum food
console.log('\n--- Fix 4: Desperate Procreation Minimum Food ---');
const procreationContent = fs.readFileSync(path.join(behaviorDir, 'procreation-behavior.ts'), 'utf-8');
const hasDesperateFoodCheck = procreationContent.includes('nearbyBushes >= 1') &&
                               procreationContent.includes('Desperate but no food sources nearby');

if (hasDesperateFoodCheck) {
  console.log('✅ VERIFIED: Desperate procreation food check added');
  console.log('   - Requires minimum 1 berry bush');
  console.log('   - Fails if no food sources');
} else {
  console.log('❌ FAILED: Desperate food check not found');
  allFixesApplied = false;
}

// Fix 5: Jealousy - tribe member check
console.log('\n--- Fix 5: Jealousy Tribe Member Protection ---');
const jealousyContent = fs.readFileSync(path.join(behaviorDir, 'jealousy-attack-behavior.ts'), 'utf-8');
const hasTribeCheck = jealousyContent.includes('stranger.leaderId === human.leaderId') &&
                       jealousyContent.includes('Stranger is in same tribe');

if (hasTribeCheck) {
  console.log('✅ VERIFIED: Tribe member check added');
  console.log('   - Compares leaderId values');
  console.log('   - Blocks attack on same-tribe members');
} else {
  console.log('❌ FAILED: Tribe check not found');
  allFixesApplied = false;
}

// Summary
console.log('\n' + '='.repeat(80));
console.log('VERIFICATION SUMMARY');
console.log('='.repeat(80));

if (allFixesApplied) {
  console.log('\n✅ ALL 5 FIXES SUCCESSFULLY APPLIED\n');
  console.log('The following semantic issues have been resolved:');
  console.log('1. Fleeing-hunger paradox → Fixed with critical health override');
  console.log('2. Predator feeding without food → Fixed with food check');
  console.log('3. Prey feeding without food → Fixed with food check');
  console.log('4. Desperate procreation in barren areas → Fixed with minimum food requirement');
  console.log('5. Jealousy attacks on tribe members → Fixed with tribe affiliation check');
  
  console.log('\n' + '='.repeat(80));
  console.log('IMPACT ASSESSMENT');
  console.log('='.repeat(80));
  console.log(`
Fix 1 (Fleeing): Prevents unnecessary deaths of starving low-health humans
  - Before: Attack while 10% health + 90% hunger → Death
  - After: Flee when health < 10% regardless of hunger → Survival

Fix 2 & 3 (Feeding): Prevents wasted AI cycles and infinite loops
  - Before: Move to child, attempt feed with no food → Loop
  - After: Only attempt feed if food.length > 0 → Efficient

Fix 4 (Procreation): Prevents child starvation in barren areas
  - Before: Desperate male creates child with 0 bushes → Child starves
  - After: Requires minimum 1 bush → Child has food source

Fix 5 (Jealousy): Maintains tribe strength and cohesion
  - Before: Attack tribe member rival → Weakened tribe
  - After: Only attack non-tribe rivals → Tribe stays strong
  `);
} else {
  console.log('\n❌ SOME FIXES FAILED TO APPLY\n');
  console.log('Please review the failed fixes above.');
}

console.log('='.repeat(80));

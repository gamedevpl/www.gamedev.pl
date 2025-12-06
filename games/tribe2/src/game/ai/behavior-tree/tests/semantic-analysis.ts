/**
 * SEMANTIC ANALYSIS OF ALL BEHAVIORS
 * 
 * This analysis goes beyond runtime bugs and side effects to examine:
 * 1. Logical correctness of conditions
 * 2. Semantic meaning and intent vs implementation
 * 3. Behavioral interactions and conflicts
 * 4. Edge cases in decision-making
 * 5. Unintended consequences
 */

import * as fs from 'fs';
import * as path from 'path';

interface SemanticIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'logic' | 'semantics' | 'interaction' | 'edge-case' | 'design';
  description: string;
  location?: string;
  recommendation?: string;
}

interface BehaviorSemanticAnalysis {
  fileName: string;
  behaviorName: string;
  purpose: string;
  issues: SemanticIssue[];
  interactions: string[];
  strengths: string[];
}

const behaviorDir = '/home/runner/work/www.gamedev.pl/www.gamedev.pl/games/tribe2/src/game/ai/behavior-tree/behaviors';

const analyses: BehaviorSemanticAnalysis[] = [];

// Analyze each behavior file for semantic issues
function analyzeSemantics(fileName: string, content: string): BehaviorSemanticAnalysis {
  const analysis: BehaviorSemanticAnalysis = {
    fileName,
    behaviorName: fileName.replace('.ts', '').replace(/-/g, ' '),
    purpose: '',
    issues: [],
    interactions: [],
    strengths: [],
  };
  
  // Extract purpose from comments
  const purposeMatch = content.match(/\/\*\*\s*\n\s*\*\s*(.+?)\n/);
  if (purposeMatch) {
    analysis.purpose = purposeMatch[1];
  }
  
  // SEMANTIC ANALYSIS BY BEHAVIOR TYPE
  
  // 1. EATING BEHAVIOR
  if (fileName === 'eating-behavior.ts') {
    analysis.purpose = 'Human eats food when hungry';
    
    // Check condition logic
    if (content.includes('human.isAdult && isHungry && hasFood && canEat')) {
      analysis.strengths.push('Properly gates eating on adult status, hunger, food availability, and cooldown');
    }
    
    // Check for issues
    if (content.includes('return NodeStatus.RUNNING')) {
      if (!content.includes('// Return RUNNING')) {
        analysis.issues.push({
          severity: 'low',
          category: 'semantics',
          description: 'Returns RUNNING for eating, which blocks other behaviors. Eating should eventually complete.',
          recommendation: 'Verify that eating state machine properly completes and clears activeAction',
        });
      }
    }
    
    // Check if direction is cleared (human shouldn't move while eating)
    if (content.includes('human.direction = { x: 0, y: 0 }')) {
      analysis.strengths.push('Correctly stops movement during eating');
    }
  }
  
  // 2. FLEEING BEHAVIOR
  if (fileName === 'fleeing-behavior.ts') {
    analysis.purpose = 'Human flees from threats when health is low';
    
    // Check health threshold logic
    if (content.includes('AI_FLEE_HEALTH_THRESHOLD')) {
      analysis.strengths.push('Uses configurable health threshold for fleeing');
    }
    
    // SEMANTIC ISSUE: Fleeing vs hunger
    if (content.includes('human.hunger > AI_ATTACK_HUNGER_THRESHOLD')) {
      analysis.issues.push({
        severity: 'high',
        category: 'logic',
        description: 'Human does NOT flee when critically hungry, even if being attacked',
        location: 'Line ~26',
        recommendation: 'This could be intentional (desperation), but seems dangerous. A critically hungry human might die from combat instead of fleeing to survive.',
      });
    }
    
    // Check flee direction calculation
    if (content.includes('getDirectionVectorOnTorus')) {
      analysis.strengths.push('Correctly calculates flee direction on toroidal map');
    }
  }
  
  // 3. GATHERING BEHAVIOR
  if (fileName === 'gathering-behavior.ts') {
    analysis.purpose = 'Human gathers food from bushes or corpses';
    
    // Check for hungry children condition
    if (content.includes('hungryChildren.length > 0')) {
      analysis.strengths.push('Will gather food for hungry children even if not personally hungry');
    }
    
    // Check bush claiming logic
    if (content.includes('bush.ownerId') && content.includes('bush.claimedUntil')) {
      analysis.strengths.push('Respects bush ownership claims');
      
      // But check if there's a potential issue
      if (content.includes('owner.leaderId === human.leaderId')) {
        analysis.issues.push({
          severity: 'medium',
          category: 'logic',
          description: 'Tribe members can take from each other\'s claimed bushes',
          recommendation: 'Consider if this is intended. It could lead to resource conflicts within a tribe.',
        });
      }
    }
    
    // Check if it prefers corpses over bushes or vice versa
    if (content.includes('distToBush <= distToCorpse ? closestBush : closestCorpse')) {
      analysis.strengths.push('Chooses closest food source (bush or corpse)');
      
      analysis.issues.push({
        severity: 'low',
        category: 'semantics',
        description: 'No preference for food type - might choose less nutritious food if closer',
        recommendation: 'Consider weighting by nutrition value, not just distance',
      });
    }
  }
  
  // 4. ATTACKING BEHAVIOR
  if (fileName === 'attacking-behavior.ts') {
    analysis.purpose = 'Human attacks hostile enemies';
    
    // Check leash mechanism
    if (content.includes('ATTACK_CHASE_MAX_DISTANCE_FROM_CENTER')) {
      analysis.strengths.push('Implements leash to prevent chasing too far from home');
      
      // Check what "home" means
      if (content.includes('getTribeCenter') && content.includes('getFamilyCenter')) {
        analysis.issues.push({
          severity: 'medium',
          category: 'logic',
          description: 'Home center calculation might be inconsistent - uses tribe center OR family center',
          location: 'Lines 48-51, 68-72',
          recommendation: 'Verify that using different centers for tribe members vs solo families doesn\'t cause issues',
        });
      }
    }
    
    // Check if already attacking
    if (content.includes('human.activeAction === \'attacking\' && human.attackTargetId')) {
      analysis.strengths.push('Continues attacking current target before finding new one');
    }
    
    // Check for target switching
    if (!content.includes('// don\'t switch targets') && content.includes('findClosestEntity')) {
      analysis.issues.push({
        severity: 'medium',
        category: 'semantics',
        description: 'Might switch targets mid-combat if a closer enemy appears',
        recommendation: 'Consider committing to current target until dead or out of range',
      });
    }
  }
  
  // 5. PROCREATION BEHAVIOR
  if (fileName === 'procreation-behavior.ts') {
    analysis.purpose = 'Human seeks partner for procreation';
    
    // Check age constraints
    if (content.includes('HUMAN_MIN_PROCREATION_AGE') && content.includes('HUMAN_FEMALE_MAX_PROCREATION_AGE')) {
      analysis.strengths.push('Enforces age constraints for procreation');
    }
    
    // Check food availability requirement
    if (content.includes('PROCREATION_MIN_NEARBY_BERRY_BUSHES')) {
      analysis.strengths.push('Requires sufficient food sources before procreating');
    }
    
    // CRITICAL: Check heirless male desperation
    if (content.includes('PROCREATION_WANDER_BEFORE_NO_HEIR_HOURS')) {
      analysis.issues.push({
        severity: 'high',
        category: 'logic',
        description: 'Heirless male will procreate WITHOUT checking food availability after wandering',
        location: 'Lines 181-216',
        recommendation: 'This desperation behavior could create children that immediately starve. Consider minimum food threshold even for desperate males.',
      });
    }
    
    // Check partner proximity avoidance
    if (content.includes('AI_PROCREATION_AVOID_PARTNER_PROXIMITY')) {
      analysis.strengths.push('Avoids procreating near partner\'s primary partner (reduces conflicts)');
      
      analysis.issues.push({
        severity: 'medium',
        category: 'semantics',
        description: 'Only checks if partner\'s PRIMARY partner is nearby, not all partners',
        location: 'Lines 223-252',
        recommendation: 'This might not prevent all jealousy situations',
      });
    }
  }
  
  // 6. PLANTING BEHAVIOR
  if (fileName === 'planting-behavior.ts') {
    analysis.purpose = 'Human plants berry bushes';
    
    // Check berry cost
    if (content.includes('BERRY_COST_FOR_PLANTING')) {
      analysis.strengths.push('Requires berries to plant (resource investment)');
    }
    
    // Check hunger threshold
    if (content.includes('HUMAN_AI_HUNGER_THRESHOLD_FOR_PLANTING')) {
      analysis.strengths.push('Won\'t plant when too hungry (survival first)');
    }
    
    // Check if it considers children
    if (content.includes('findChildren') && content.includes('children.length * 5')) {
      analysis.issues.push({
        severity: 'medium',
        category: 'logic',
        description: 'Plants based on 5:1 bush-to-child ratio, which might be too many bushes',
        location: 'Line 154',
        recommendation: 'Verify this ratio is balanced. Too many bushes might waste berries.',
      });
    }
    
    // Check planting zone preference
    if (content.includes('findOptimalPlantingZoneSpot') && content.includes('findOptimalBushPlantingSpot')) {
      analysis.strengths.push('Prefers planting in designated zones, falls back to optimal spots');
    }
  }
  
  // 7. FOLLOW LEADER BEHAVIOR
  if (fileName === 'follow-leader-behavior.ts') {
    analysis.purpose = 'Tribe member follows their leader';
    
    if (content.includes('human.leaderId') && content.includes('leader.id !== human.id')) {
      analysis.strengths.push('Non-leaders follow their leader');
    }
    
    // Check if it maintains distance or follows exactly
    if (content.includes('HUMAN_INTERACTION_PROXIMITY')) {
      analysis.issues.push({
        severity: 'low',
        category: 'semantics',
        description: 'Uses INTERACTION_PROXIMITY for follow distance - might be too close',
        recommendation: 'Consider a separate FOLLOW_DISTANCE constant for more natural spacing',
      });
    }
  }
  
  // 8. DESPERATE ATTACK BEHAVIOR
  if (fileName === 'desperate-attack-behavior.ts') {
    analysis.purpose = 'Human attacks when desperate (hungry and low health)';
    
    // Check desperation conditions
    if (content.includes('AI_ATTACK_HUNGER_THRESHOLD') && content.includes('AI_FLEE_HEALTH_THRESHOLD')) {
      analysis.issues.push({
        severity: 'critical',
        category: 'logic',
        description: 'SEMANTIC CONFLICT: Human flees when low health UNLESS critically hungry. Then desperate attack overrides fleeing.',
        location: 'Entire behavior vs fleeing-behavior.ts',
        recommendation: 'This creates a critical decision: flee to survive vs attack for food. Current logic prioritizes attack when hungry, which could lead to death. Verify this is intended.',
      });
    }
  }
  
  // 9. JEALOUSY ATTACK BEHAVIOR  
  if (fileName === 'jealousy-attack-behavior.ts') {
    analysis.purpose = 'Human attacks partner\'s other partners out of jealousy';
    
    if (content.includes('partnerIds')) {
      analysis.issues.push({
        severity: 'high',
        category: 'semantics',
        description: 'Jealousy attack could kill valuable tribe members over polygamy',
        recommendation: 'Consider tribe affiliation before allowing jealousy attacks. Killing tribe members weakens the tribe.',
      });
    }
  }
  
  // 10. DEFEND FAMILY BEHAVIOR
  if (fileName === 'defend-family-behavior.ts') {
    analysis.purpose = 'Human defends family members from attacks';
    
    if (content.includes('findChildren') || content.includes('partner')) {
      analysis.strengths.push('Protects family members');
      
      analysis.issues.push({
        severity: 'medium',
        category: 'interaction',
        description: 'Family defense vs tribe defense - which takes priority?',
        recommendation: 'Verify behavior tree ordering ensures correct priorities',
      });
    }
  }
  
  // 11. LEADER CALL TO ATTACK
  if (fileName === 'leader-call-to-attack-behavior.ts') {
    analysis.purpose = 'Leader rallies tribe for attack or retreat';
    
    // Check strength calculation
    if (content.includes('calculateTribeStrength') && content.includes('LEADER_COMBAT_STRENGTH_ADVANTAGE_THRESHOLD')) {
      analysis.strengths.push('Leader evaluates combat strength before committing to attack');
      
      analysis.issues.push({
        severity: 'high',
        category: 'logic',
        description: 'Strength calculation might not account for enemy reinforcements or healing',
        recommendation: 'Consider making strength evaluation more dynamic',
      });
    }
    
    // Check retreat logic
    if (content.includes('fleeDirection')) {
      analysis.strengths.push('Leader can order retreat when outnumbered');
    }
  }
  
  // 12. TRIBE SPLIT BEHAVIOR
  if (fileName === 'tribe-split-behavior.ts') {
    analysis.purpose = 'Large tribes split into smaller groups';
    
    if (content.includes('TRIBE_SPLIT_SIZE_THRESHOLD')) {
      analysis.issues.push({
        severity: 'high',
        category: 'semantics',
        description: 'Tribe splitting might separate families or break important social bonds',
        recommendation: 'Consider family relationships when splitting tribes',
      });
    }
  }
  
  // 13. ESTABLISH FAMILY TERRITORY
  if (fileName === 'establish-family-territory-behavior.ts') {
    analysis.purpose = 'Adult male with family moves away from parents';
    
    // Check player heir exception
    if (content.includes('playerHeir?.id === human.id')) {
      analysis.strengths.push('Player\'s heir stays near player (good UX)');
    }
    
    if (content.includes('father') && !content.includes('mother')) {
      analysis.issues.push({
        severity: 'low',
        category: 'logic',
        description: 'Only checks distance from father, not mother',
        recommendation: 'Consider both parents for completeness',
      });
    }
    
    // Check timeout
    if (content.includes('ESTABLISH_TERRITORY_MOVEMENT_TIMEOUT_HOURS')) {
      analysis.issues.push({
        severity: 'medium',
        category: 'semantics',
        description: 'If movement times out, family might stay too close to parents',
        recommendation: 'Consider retry mechanism or alternative target selection',
      });
    }
  }
  
  // PREDATOR BEHAVIORS
  
  // 14. PREDATOR HUNT
  if (fileName === 'predator-hunt-behavior.ts') {
    analysis.purpose = 'Predator hunts prey for food';
    
    if (content.includes('TimeoutNode')) {
      analysis.strengths.push('Hunt has timeout to prevent infinite chasing');
      
      analysis.issues.push({
        severity: 'medium',
        category: 'semantics',
        description: 'Timeout might be too short for successful hunts',
        recommendation: 'Verify timeout duration allows for realistic hunt completion',
      });
    }
  }
  
  // 15. PREDATOR PACK
  if (fileName === 'predator-pack-behavior.ts') {
    analysis.purpose = 'Predators form packs and follow pack leader';
    
    if (content.includes('packLeader')) {
      analysis.issues.push({
        severity: 'medium',
        category: 'logic',
        description: 'Pack leader selection criteria not visible in behavior itself',
        recommendation: 'Ensure pack leader is strongest/most suitable predator',
      });
    }
  }
  
  // 16. PREDATOR TERRITORIAL
  if (fileName === 'predator-territorial-behavior.ts') {
    analysis.purpose = 'Predator defends territory from other predators';
    
    if (content.includes('territory')) {
      analysis.issues.push({
        severity: 'high',
        category: 'interaction',
        description: 'Territorial behavior conflicts with pack behavior - which wins?',
        recommendation: 'Ensure behavior tree ordering prevents pack members from fighting each other',
      });
    }
  }
  
  // PREY BEHAVIORS
  
  // 17. PREY FLEE
  if (fileName === 'prey-flee-behavior.ts') {
    analysis.purpose = 'Prey flees from predators';
    
    if (content.includes('fleeDistance')) {
      analysis.strengths.push('Calculates dynamic flee distance');
      
      analysis.issues.push({
        severity: 'medium',
        category: 'semantics',
        description: 'Flee distance calculation might lead prey into other dangers',
        recommendation: 'Consider checking destination for other threats',
      });
    }
  }
  
  // 18. PREY HERD
  if (fileName === 'prey-herd-behavior.ts') {
    analysis.purpose = 'Prey animals form herds for safety';
    
    if (content.includes('herdCenter')) {
      analysis.strengths.push('Prey moves toward herd center');
      
      analysis.issues.push({
        severity: 'low',
        category: 'semantics',
        description: 'Herd center might move prey away from food sources',
        recommendation: 'Balance herding with grazing needs',
      });
    }
  }
  
  // 19. FEEDING CHILD BEHAVIORS (multiple)
  if (fileName.includes('feeding') && fileName.includes('child')) {
    analysis.purpose = 'Parent feeds hungry children';
    
    if (!content.includes('food.length > 0')) {
      analysis.issues.push({
        severity: 'critical',
        category: 'logic',
        description: 'Might attempt to feed children without having food',
        recommendation: 'Add food availability check before attempting to feed',
      });
    }
  }
  
  // 20. CHILD SEEK FOOD BEHAVIORS
  if (fileName.includes('child') && fileName.includes('seek')) {
    analysis.purpose = 'Child seeks food from parents';
    
    if (content.includes('targetParent')) {
      analysis.issues.push({
        severity: 'medium',
        category: 'semantics',
        description: 'Child might repeatedly request food from parent who has none',
        recommendation: 'Add check for parent food availability before requesting',
      });
    }
  }
  
  return analysis;
}

// Main analysis
console.log('='.repeat(80));
console.log('SEMANTIC ANALYSIS - ALL BEHAVIORS');
console.log('Deep analysis of logic, intent, and behavioral interactions');
console.log('='.repeat(80));

const files = fs.readdirSync(behaviorDir)
  .filter(f => f.endsWith('.ts') && !f.includes('test') && !f.includes('tester') && !f.includes('analysis') && f !== 'index.ts')
  .sort();

for (const file of files) {
  const filePath = path.join(behaviorDir, file);
  const content = fs.readFileSync(filePath, 'utf-8');
  const analysis = analyzeSemantics(file, content);
  analyses.push(analysis);
}

// Report findings
console.log('\n' + '='.repeat(80));
console.log('CRITICAL SEMANTIC ISSUES');
console.log('='.repeat(80));

const criticalIssues = analyses.flatMap(a => 
  a.issues.filter(i => i.severity === 'critical').map(i => ({ behavior: a.fileName, ...i }))
);

if (criticalIssues.length > 0) {
  criticalIssues.forEach((issue, idx) => {
    console.log(`\n${idx + 1}. ${issue.behavior}`);
    console.log(`   Category: ${issue.category}`);
    console.log(`   Issue: ${issue.description}`);
    if (issue.location) console.log(`   Location: ${issue.location}`);
    if (issue.recommendation) console.log(`   → ${issue.recommendation}`);
  });
} else {
  console.log('\n✓ No critical semantic issues found');
}

console.log('\n' + '='.repeat(80));
console.log('HIGH PRIORITY SEMANTIC ISSUES');
console.log('='.repeat(80));

const highIssues = analyses.flatMap(a => 
  a.issues.filter(i => i.severity === 'high').map(i => ({ behavior: a.fileName, ...i }))
);

highIssues.forEach((issue, idx) => {
  console.log(`\n${idx + 1}. ${issue.behavior}`);
  console.log(`   Category: ${issue.category}`);
  console.log(`   Issue: ${issue.description}`);
  if (issue.location) console.log(`   Location: ${issue.location}`);
  if (issue.recommendation) console.log(`   → ${issue.recommendation}`);
});

console.log('\n' + '='.repeat(80));
console.log('BEHAVIORAL INTERACTION CONCERNS');
console.log('='.repeat(80));

console.log(`
The following behavior interactions could lead to conflicts or unexpected outcomes:

1. FLEEING vs DESPERATE ATTACK
   - Low health triggers flee
   - But critical hunger triggers desperate attack instead
   - Result: Hungry low-health humans attack instead of fleeing (likely death)
   - Priority: CRITICAL

2. JEALOUSY ATTACK vs TRIBE COHESION
   - Jealousy can cause attacks on tribe members
   - Could weaken tribe in combat
   - Priority: HIGH

3. TERRITORY DEFENSE vs PACK BEHAVIOR (Predators)
   - Territorial predators might attack pack members
   - Pack behavior needs higher priority
   - Priority: HIGH

4. GATHERING from CLAIMED BUSHES (Same Tribe)
   - Tribe members can take from each other's bushes
   - Could cause resource conflicts
   - Priority: MEDIUM

5. HERD BEHAVIOR vs GRAZING (Prey)
   - Herding might move prey away from food
   - Could lead to starvation
   - Priority: MEDIUM

6. CHILD FEEDING without FOOD CHECK
   - Parents might attempt to feed without food
   - Wastes behavior cycles
   - Priority: MEDIUM
`);

console.log('\n' + '='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));

const totalIssues = analyses.reduce((sum, a) => sum + a.issues.length, 0);
const byCategory = {
  logic: analyses.flatMap(a => a.issues).filter(i => i.category === 'logic').length,
  semantics: analyses.flatMap(a => a.issues).filter(i => i.category === 'semantics').length,
  interaction: analyses.flatMap(a => a.issues).filter(i => i.category === 'interaction').length,
  'edge-case': analyses.flatMap(a => a.issues).filter(i => i.category === 'edge-case').length,
};

console.log(`
Total behaviors analyzed: ${analyses.length}
Total semantic issues found: ${totalIssues}

By severity:
  Critical: ${criticalIssues.length}
  High: ${highIssues.length}
  Medium: ${analyses.flatMap(a => a.issues).filter(i => i.severity === 'medium').length}
  Low: ${analyses.flatMap(a => a.issues).filter(i => i.severity === 'low').length}

By category:
  Logic errors: ${byCategory.logic}
  Semantic issues: ${byCategory.semantics}
  Interaction conflicts: ${byCategory.interaction}
  Edge cases: ${byCategory['edge-case']}
`);

console.log('='.repeat(80));

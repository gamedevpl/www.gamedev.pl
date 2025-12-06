/**
 * Comprehensive Behavior Analysis - ALL Behaviors
 * 
 * This script systematically analyzes ALL 39 behaviors in the behavior tree system.
 * It checks for:
 * 1. Blackboard usage and cleanup
 * 2. Proper use of decorators (CooldownNode, CachingNode, etc.)
 * 3. Condition validation
 * 4. Edge cases and potential bugs
 */

import * as fs from 'fs';
import * as path from 'path';

interface BehaviorAnalysis {
  fileName: string;
  behaviorName: string;
  blackboardKeys: string[];
  hasCleanup: boolean;
  usesDecorators: {
    cooldown: boolean;
    caching: boolean;
    timeout: boolean;
  };
  lineCount: number;
  complexity: 'low' | 'medium' | 'high';
  potentialIssues: string[];
}

const behaviorDir = '/home/runner/work/www.gamedev.pl/www.gamedev.pl/games/tribe2/src/game/ai/behavior-tree/behaviors';

async function analyzeBehaviorFile(filePath: string): Promise<BehaviorAnalysis> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);
  const lines = content.split('\n');
  
  const analysis: BehaviorAnalysis = {
    fileName,
    behaviorName: fileName.replace('.ts', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    blackboardKeys: [],
    hasCleanup: false,
    usesDecorators: {
      cooldown: false,
      caching: false,
      timeout: false,
    },
    lineCount: lines.length,
    complexity: 'low',
    potentialIssues: [],
  };
  
  // Extract blackboard keys
  const setMatches = content.matchAll(/Blackboard\.set\([^,]+,\s*['"`]([^'"`]+)['"`]/g);
  for (const match of setMatches) {
    if (!analysis.blackboardKeys.includes(match[1])) {
      analysis.blackboardKeys.push(match[1]);
    }
  }
  
  // Check for cleanup
  const deleteMatches = content.match(/Blackboard\.delete/g);
  analysis.hasCleanup = deleteMatches ? deleteMatches.length > 0 : false;
  
  // Check decorator usage
  analysis.usesDecorators.cooldown = content.includes('CooldownNode');
  analysis.usesDecorators.caching = content.includes('CachingNode');
  analysis.usesDecorators.timeout = content.includes('TimeoutNode');
  
  // Determine complexity
  if (lines.length > 150) {
    analysis.complexity = 'high';
  } else if (lines.length > 75) {
    analysis.complexity = 'medium';
  }
  
  // Check for potential issues
  
  // Issue 1: Blackboard keys without cleanup
  if (analysis.blackboardKeys.length > 0 && !analysis.hasCleanup) {
    analysis.potentialIssues.push(`Sets ${analysis.blackboardKeys.length} blackboard key(s) but has no Blackboard.delete calls`);
  }
  
  // Issue 2: CooldownNode usage (after our fix, verify it's used correctly)
  if (analysis.usesDecorators.cooldown) {
    // This is actually fine now after our fix, but note it for review
    analysis.potentialIssues.push('Uses CooldownNode (verify cooldown duration is appropriate)');
  }
  
  // Issue 3: Complex sequences with conditions
  const sequenceCount = (content.match(/new Sequence\(/g) || []).length;
  const conditionCount = (content.match(/new ConditionNode\(/g) || []).length;
  if (sequenceCount > 2 && conditionCount > 3) {
    analysis.potentialIssues.push('Complex nested sequences with multiple conditions (verify re-evaluation behavior)');
  }
  
  // Issue 4: Check for RUNNING status handling
  if (content.includes('NodeStatus.RUNNING') && !content.includes('// RUNNING')) {
    // This is fine, but worth noting
  }
  
  // Issue 5: Missing error handling for entity lookups
  if (content.includes('entities.entities[') && !content.includes('| undefined')) {
    analysis.potentialIssues.push('Entity lookups may not handle undefined cases');
  }
  
  return analysis;
}

async function analyzeAllBehaviors() {
  console.log('='.repeat(80));
  console.log('COMPREHENSIVE BEHAVIOR TREE ANALYSIS - ALL BEHAVIORS');
  console.log('='.repeat(80));
  
  const files = fs.readdirSync(behaviorDir)
    .filter(f => f.endsWith('.ts') && !f.includes('test') && !f.includes('tester') && !f.includes('analysis') && f !== 'index.ts')
    .sort();
  
  console.log(`\nAnalyzing ${files.length} behaviors...\n`);
  
  const analyses: BehaviorAnalysis[] = [];
  
  for (const file of files) {
    const filePath = path.join(behaviorDir, file);
    const analysis = await analyzeBehaviorFile(filePath);
    analyses.push(analysis);
  }
  
  // Summary by category
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY BY CATEGORY');
  console.log('='.repeat(80));
  
  // 1. Blackboard usage
  console.log('\n--- Behaviors Using Blackboard ---');
  const withBlackboard = analyses.filter(a => a.blackboardKeys.length > 0);
  console.log(`Total: ${withBlackboard.length} behaviors`);
  console.log(`With cleanup: ${withBlackboard.filter(a => a.hasCleanup).length}`);
  console.log(`Without cleanup: ${withBlackboard.filter(a => !a.hasCleanup).length}`);
  
  // 2. Decorator usage
  console.log('\n--- Decorator Usage ---');
  console.log(`CooldownNode: ${analyses.filter(a => a.usesDecorators.cooldown).length} behaviors`);
  console.log(`CachingNode: ${analyses.filter(a => a.usesDecorators.caching).length} behaviors`);
  console.log(`TimeoutNode: ${analyses.filter(a => a.usesDecorators.timeout).length} behaviors`);
  
  // 3. Complexity
  console.log('\n--- Complexity Distribution ---');
  console.log(`High (>150 lines): ${analyses.filter(a => a.complexity === 'high').length} behaviors`);
  console.log(`Medium (75-150 lines): ${analyses.filter(a => a.complexity === 'medium').length} behaviors`);
  console.log(`Low (<75 lines): ${analyses.filter(a => a.complexity === 'low').length} behaviors`);
  
  // 4. Issues found
  console.log('\n--- Potential Issues Summary ---');
  const withIssues = analyses.filter(a => a.potentialIssues.length > 0);
  console.log(`Behaviors with potential issues: ${withIssues.length} / ${analyses.length}`);
  
  // Detailed report
  console.log('\n' + '='.repeat(80));
  console.log('DETAILED ANALYSIS BY BEHAVIOR');
  console.log('='.repeat(80));
  
  for (const analysis of analyses) {
    console.log(`\n--- ${analysis.behaviorName} (${analysis.fileName}) ---`);
    console.log(`Lines: ${analysis.lineCount} | Complexity: ${analysis.complexity}`);
    
    if (analysis.blackboardKeys.length > 0) {
      console.log(`Blackboard keys: ${analysis.blackboardKeys.join(', ')}`);
      console.log(`Cleanup: ${analysis.hasCleanup ? '✓' : '✗ (potential memory leak)'}`);
    }
    
    if (Object.values(analysis.usesDecorators).some(v => v)) {
      const decorators = [];
      if (analysis.usesDecorators.cooldown) decorators.push('CooldownNode');
      if (analysis.usesDecorators.caching) decorators.push('CachingNode');
      if (analysis.usesDecorators.timeout) decorators.push('TimeoutNode');
      console.log(`Decorators: ${decorators.join(', ')}`);
    }
    
    if (analysis.potentialIssues.length > 0) {
      console.log('⚠️  Issues:');
      analysis.potentialIssues.forEach(issue => console.log(`   - ${issue}`));
    } else {
      console.log('✓ No issues detected');
    }
  }
  
  // Critical findings
  console.log('\n' + '='.repeat(80));
  console.log('CRITICAL FINDINGS');
  console.log('='.repeat(80));
  
  const criticalIssues = analyses.filter(a => {
    return a.blackboardKeys.length > 0 && !a.hasCleanup;
  });
  
  if (criticalIssues.length > 0) {
    console.log(`\n⚠️  ${criticalIssues.length} behaviors set blackboard keys without cleanup:`);
    criticalIssues.forEach(a => {
      console.log(`   - ${a.fileName}: keys = [${a.blackboardKeys.join(', ')}]`);
    });
    console.log('\nRecommendation: Add Blackboard.delete() calls in failure/completion paths');
  } else {
    console.log('\n✓ All behaviors with blackboard usage have cleanup');
  }
  
  // High complexity behaviors
  const highComplexity = analyses.filter(a => a.complexity === 'high');
  if (highComplexity.length > 0) {
    console.log(`\n📊 ${highComplexity.length} high-complexity behaviors (>150 lines):`);
    highComplexity.forEach(a => {
      console.log(`   - ${a.fileName} (${a.lineCount} lines)`);
    });
    console.log('\nRecommendation: Consider breaking down into smaller sub-behaviors');
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('ANALYSIS COMPLETE');
  console.log('='.repeat(80));
  console.log(`\nTotal behaviors analyzed: ${analyses.length}`);
  console.log(`Behaviors with issues: ${withIssues.length}`);
  console.log(`Clean behaviors: ${analyses.length - withIssues.length}`);
  
  return analyses;
}

// Run analysis
analyzeAllBehaviors().catch(console.error);

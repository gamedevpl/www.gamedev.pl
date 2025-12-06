# SEMANTIC ANALYSIS - Deep Dive into Behavior Logic

## Executive Summary

Beyond runtime bugs and memory leaks, this analysis examines the **logical correctness** and **semantic meaning** of each behavior. We found **4 HIGH severity** and **14 MEDIUM severity** semantic issues that could lead to incorrect AI decisions, unintended deaths, or poor gameplay experience.

## Critical Semantic Issues

### 1. FLEEING vs DESPERATE ATTACK Paradox ⚠️ HIGH

**Behaviors:** `fleeing-behavior.ts`, `desperate-attack-behavior.ts`

**The Issue:**
A human with low health (< 15%) normally flees. HOWEVER, if hunger > 127.5 (85% of 150), fleeing is DISABLED (line 26 of fleeing-behavior.ts):

```typescript
// Don't flee if critically hungry
if (human.isAdult && human.hunger > AI_ATTACK_HUNGER_THRESHOLD) {
  return false;
}
```

This means a human with 10% health and 90% hunger will NOT flee, even when being attacked. Instead, desperate-attack-behavior takes over.

**Consequences:**
- Starving humans with low health attack instead of fleeing
- High probability of death (lose combat + already low health)
- Player frustration: "Why didn't they flee?"

**Recommendation:**
```typescript
// Option 1: Always allow fleeing at critical health
if (human.hitpoints < human.maxHitpoints * 0.05) { // < 5% health
  return true; // Flee regardless of hunger
}

// Option 2: Weight health vs hunger
const healthCritical = human.hitpoints < human.maxHitpoints * 0.1;
const hungerCritical = human.hunger > AI_ATTACK_HUNGER_THRESHOLD;
// Flee if health is MORE critical than hunger
if (healthCritical && !hungerCritical) {
  return true;
}
```

---

### 2. Predator/Prey Feeding Without Food Check ⚠️ HIGH

**Behaviors:** `predator-feeding-behavior.ts`, `prey-feeding-behavior.ts`

**The Issue:**
Unlike human feeding (line 82 checks `human.food.length > 0`), predator and prey feeding behaviors do NOT check if parent has food:

```typescript
// Predator (lines 86-92)
predator.isAdult &&
predator.gender === 'female' &&
predator.hunger < 90 &&
(!predator.feedChildCooldownTime || predator.feedChildCooldownTime <= 0)
// Missing: predator.food.length > 0
```

**Consequences:**
- Parent moves to child attempting to feed
- Feeding action initiated but no food to give
- Child remains hungry
- Wasted AI cycles
- Possible infinite loop if child keeps requesting

**Recommendation:**
```typescript
// Add food check
return (
  predator.isAdult &&
  predator.gender === 'female' &&
  predator.food.length > 0 && // ADD THIS
  predator.hunger < 90 &&
  (!predator.feedChildCooldownTime || predator.feedChildCooldownTime <= 0)
) ?? false;
```

---

### 3. Heirless Male Procreation Desperation ⚠️ HIGH

**Behavior:** `procreation-behavior.ts` (lines 181-216)

**The Issue:**
Males without an heir will procreate even in barren environments after wandering for PROCREATION_WANDER_BEFORE_NO_HEIR_HOURS:

```typescript
// Branch 2: Heirless Desperation Path
// Bypasses food availability check!
if (elapsed >= PROCREATION_WANDER_BEFORE_NO_HEIR_HOURS) {
  return [NodeStatus.SUCCESS, 'Wandered for ${elapsed.toFixed(1)}h, proceeding without food'];
}
```

**Consequences:**
- Child born in area with no food
- Child likely starves immediately
- Mother's pregnancy drains her resources
- Family death spiral

**Recommendation:**
```typescript
// Even desperate males should check MINIMUM food
const nearbyBushes = countEntitiesOfTypeInRadius(
  human.position,
  context.gameState,
  'berryBush',
  PROCREATION_FOOD_SEARCH_RADIUS,
);
// Allow desperation but require at least 1 bush
return nearbyBushes >= 1; // Changed from >= PROCREATION_MIN_NEARBY_BERRY_BUSHES
```

---

### 4. Jealousy Attack Can Kill Tribe Members ⚠️ HIGH

**Behavior:** `jealousy-attack-behavior.ts`

**The Issue:**
A human can attack their partner's other partners, even if they're in the same tribe:

```typescript
// No tribe affiliation check!
// Will attack ANY partner of partner
```

**Consequences:**
- Weakens tribe in combat
- Kills valuable hunters/gatherers
- Reduces tribe survival chances
- Counter-intuitive gameplay

**Recommendation:**
```typescript
// Check tribe affiliation before allowing jealousy attack
const isSameTribe = rival.leaderId === human.leaderId;
if (isSameTribe) {
  return false; // Don't attack tribe members
}
```

---

## Medium Severity Issues

### 5. Gathering from Tribe Members' Claimed Bushes

**Behavior:** `gathering-behavior.ts` (line 56)

**Issue:** Tribe members can gather from each other's claimed bushes.

**Impact:** Resource conflicts within tribe, defeating purpose of bush claims.

**Recommendation:** Add individual ownership check, not just tribe check.

---

### 6. Leader Strength Calculation Static

**Behavior:** `leader-call-to-attack-behavior.ts`

**Issue:** Strength calculation doesn't account for:
- Enemy reinforcements arriving
- Healing during combat
- Moral/fatigue effects

**Impact:** Leader might call attack that becomes unwinnable.

**Recommendation:** Add dynamic re-evaluation during combat.

---

### 7. Predator Territorial vs Pack Conflict

**Behavior:** `predator-territorial-behavior.ts`, `predator-pack-behavior.ts`

**Issue:** No clear priority - might attack pack members.

**Impact:** Pack cohesion breaks down.

**Recommendation:** Ensure pack check comes before territorial aggression.

---

### 8. Prey Herd vs Grazing Priority

**Behavior:** `prey-herd-behavior.ts`, `prey-graze-behavior.ts`

**Issue:** Herding might move prey away from food.

**Impact:** Starvation while in "safety" of herd.

**Recommendation:** Weight herding by nearby food availability.

---

### 9. Attacking Home Center Inconsistency

**Behavior:** `attacking-behavior.ts` (lines 48-51, 68-72)

**Issue:** Uses getTribeCenter OR getFamilyCenter inconsistently.

```typescript
const homeCenter = human.leaderId
  ? getTribeCenter(human.leaderId, gameState)
  : getFamilyMembers(human, gameState).length > 0
  ? getFamilyCenter(human, gameState)
  : human.position;
```

**Impact:** Solo families might have different leash distance than tribe members.

**Recommendation:** Standardize home center calculation.

---

### 10. Planting 5:1 Bush-to-Child Ratio

**Behavior:** `planting-behavior.ts` (line 154)

**Issue:** `nearbyBushes >= children.length * 5` might be excessive.

**Impact:** Wastes berries on unnecessary bushes.

**Recommendation:** Tune ratio based on gameplay testing.

---

### 11. Follow Leader Distance Too Close

**Behavior:** `follow-leader-behavior.ts`

**Issue:** Uses HUMAN_INTERACTION_PROXIMITY for follow distance.

**Impact:** Followers crowd leader unnaturally.

**Recommendation:** Add FOLLOW_DISTANCE constant (larger than interaction proximity).

---

### 12. Tribe Split Doesn't Consider Families

**Behavior:** `tribe-split-behavior.ts`

**Issue:** Splitting algorithm doesn't preserve family units.

**Impact:** Separates parents from children.

**Recommendation:** Keep families together when splitting.

---

### 13. Establish Territory Only Checks Father

**Behavior:** `establish-family-territory-behavior.ts` (line 49)

**Issue:** Only checks distance from father, not mother.

**Impact:** Might stay too close to mother's location.

**Recommendation:** Check both parents.

---

### 14. Establish Territory Timeout Gives Up

**Behavior:** `establish-family-territory-behavior.ts`

**Issue:** If movement times out, family stays near parents.

**Impact:** Defeats purpose of behavior.

**Recommendation:** Add retry with new target.

---

### 15. Predator Hunt Timeout Too Short

**Behavior:** `predator-hunt-behavior.ts`

**Issue:** Timeout might expire before successful hunt.

**Impact:** Predators give up too easily, starve.

**Recommendation:** Verify timeout allows realistic hunt duration.

---

### 16. Prey Flee Doesn't Check Destination

**Behavior:** `prey-flee-behavior.ts`

**Issue:** Flee direction calculated without checking for other threats.

**Impact:** Might flee into another predator.

**Recommendation:** Check destination for threats before fleeing.

---

### 17. Procreation Partner Proximity Only Checks Primary

**Behavior:** `procreation-behavior.ts` (lines 223-252)

**Issue:** Only avoids partner's PRIMARY partner, not all partners.

**Impact:** Jealousy situations still occur.

**Recommendation:** Check all of partner's partners.

---

### 18. Gathering Prefers Distance Over Nutrition

**Behavior:** `gathering-behavior.ts` (line 98)

**Issue:** Chooses closest food source regardless of nutrition value.

```typescript
foodSource = distToBush <= distToCorpse ? closestBush : closestCorpse;
```

**Impact:** Might gather less nutritious food.

**Recommendation:** Weight by nutrition value, not just distance.

---

## Interaction Matrix

| Behavior A | Behavior B | Potential Conflict | Priority |
|------------|------------|-------------------|----------|
| Fleeing | Desperate Attack | Hunger blocks fleeing | **CRITICAL** |
| Jealousy Attack | Tribe Cohesion | Weakens own tribe | **HIGH** |
| Territorial | Pack Behavior | Attacks pack members | **HIGH** |
| Herd Behavior | Grazing | Away from food | **MEDIUM** |
| Gathering | Bush Claims | Tribe conflicts | **MEDIUM** |
| Follow Leader | Personal Goals | Crowding | **LOW** |

---

## Recommendations by Priority

### Immediate (Critical)
1. Fix fleeing-hunger paradox
2. Add food check to predator/prey feeding
3. Add minimum food for heirless procreation
4. Add tribe check to jealousy attacks

### Short Term (High)
5. Fix predator pack vs territorial priority
6. Improve leader combat evaluation
7. Standardize home center calculation

### Medium Term (Optimize)
8. Tune planting ratios
9. Improve flee destination checking
10. Better herd-vs-food balancing
11. Family-aware tribe splitting

### Long Term (Polish)
12. Follow distance tuning
13. Hunt timeout optimization
14. Territory establishment improvements

---

## Testing Recommendations

1. **Survival Scenario:** Low health + high hunger human near enemy
   - Expected: Should flee
   - Current: Attacks and likely dies
   
2. **Feeding Scenario:** Predator with no food trying to feed child
   - Expected: Should not attempt feeding
   - Current: Moves to child, wastes cycles
   
3. **Procreation Scenario:** Heirless male in barren land
   - Expected: Should wait for better conditions
   - Current: Creates child that starves
   
4. **Tribe Scenario:** Jealous human vs tribe member rival
   - Expected: Should not attack tribe member
   - Current: Attacks, weakens tribe

---

## Conclusion

While the behavior tree framework is solid (after the CooldownNode fix), several behaviors have **semantic logic issues** that lead to poor AI decisions. The most critical is the fleeing-hunger paradox, which can cause unnecessary deaths. The others range from inefficient resource usage to social dysfunction within tribes.

**Total Issues:** 18 semantic issues
- **Critical:** 4
- **High:** 0 (all critical issues are high-impact)
- **Medium:** 14
- **Low:** 0

These issues are **design/logic problems**, not bugs in the traditional sense. They represent **unintended consequences** of the current rule systems.

# Summary

Computer controlled states

# Description

Each state has the following objectives:

- protect your cities and launch sites
- eliminate other states launch sites and cities

Launch sites and missiles are the tool to achieve those objectives:

- shot down enemy missiles which are approaching your cities
- launch missiles towards enemy launch sites and cities

## Remarks

Below are answers to questions which may arise when analyzing this task.

- Question: What algorithms or strategies should they use to make decisions (e.g., random targeting, prioritizing targets, resource management)?
  Answer: Prioritze enemy missiles which targeted towards you, then destroy enemy launch sites, and finally destroy enemy cities.

- Question: Should they have different difficulty levels? If so, how would those levels be implemented?
  Answer: No, all states should be equally difficult

- Are there any limitations to their actions, such as a maximum number of missiles they can launch at once or a cooldown period between launches?
  Answer: Cooldown should be 5 seconds, and there is unlimited number of missiles to launch

## Implementation hints

The logic should be implemented in the `updateWorldState` function.

### Algorithm for finding best target for missiles

The algorithm is simple:

- find enemy missiles which are targeted towards any of your cities or launch sites
- sort them by arrival team, sooner arrival means higher priority to intercept
- if no enemy missiles targeted towards your cities or launch sites, find closest enemy launch site
- if no launch site, find closest enemy city

### Algorithm for targeting best targets

How to target enemy city:

- simply launch missile towards the city location

How to target enemy launch site:

- simply launch missile towards the launch site location

How to target enemy missile:

- get the target location of the enemy missile
- calculate current position of the missile
- get the position of your launch site
- calculate the interception point (caution: interception point must not be close to your city/launch site)

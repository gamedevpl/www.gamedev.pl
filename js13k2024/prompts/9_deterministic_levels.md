Random generaiton of levels does not work well, because:

- very often there are quirks like initial monsters impossible to pass
- the game is not entirely fun
- the level progression does not make much sense

That's why I want to have deterministic level generation based. First few levels are supposed to let the player experience the game mechanics. After first few levels the player should know how to use each bonus.

Lets call them teaching bonuses:

1. The player must get to goal in 13 steps avoiding the monster
2. The player must collect the invisibility cap bonus, otherwise the level configuration should prevent completion
3. Builder bonus is required to win
4. Crusher bonus is required to win
5. Time bomb bonus is required to win
6. Land mine bonus is required to win
7. Confused monsters bonus is required to win

After that we want player to have a need to use combinations of bonuses to win:

8. Builder and land mine: build a tunnel around land mines, to drag monsters into the trap

9-12. other combinations

13. The final level which is very hard to complete and requires strategic thinking

The game ends after level 13, and the player will see a nice splash screen with congratulations.

I want to have a dedicated directory for level generation, and each level added to a dedicated file, with each level specified as a function, or as a fallback solution have a 13 hardcoded levels. You could also create level generation utils file if there is some common code/logic that makes sense to be extracted.

Make sure that each level is actually possible to pass. Maybe monster spawn points should also be predefined, and set in a way that makes sense from the level perspective.

Each level could have a funny name/short story attached to it, and the player could see this story before stating the level.

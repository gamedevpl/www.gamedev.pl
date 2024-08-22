We need to fix a problem in the gameplay. Currently on some levels the monster can spawn at a random position which makes it impossible to finish the level. Also some combinations of initial bonuses, their positions, and initial positions of monsters make it impossible to progress. It will frustrate the user

Here are the problems I have noticed:

- Level4: second monster spawns almost next to the crusher bonus, and it is not possible to finish the level even though I successfuly collect the crusher bonus as intended
- Level5: I can get to the time bomb bonus, activate it, but the second monster very often spawns very close to me, and I'm not able to finish the level
- Level8: This level is not possible to complete most of the time, I activate the land mine, and can't get monsters to step on it. Also I don't know how to make use of the builder bonus
- Level9: I can't even step on the invisibility bonus
- Level10: The crusher bonus is to close to monster and I can't pick it up, but even if I would use it I don't understand what would be the benefit
- Level11: Builder bonus is too close
- Level12: I don't understand what is the idea with this setup, and how to play it. Perhaps this level should be the final pre-made setup before the final level 13.

## Level 13

This level requires additional refactor. My idea is to start from blank grid (no bonuses, no obstacles), player would start from one corner, and the goal would be on opposite corner. Bonuses will be spawned at the same time as monster spawns. The bottom line of all spawns would be to allow the player play the level continously to max up the score. So they should be getting enough of bonuses, and adequate bonuses to either eliminate monsters or protect from monsters. It means that the monster and bonus spawn should have a logic that understands how to not eliminate player with monster spawn, and also which bonus to spawn in order to let player progress.

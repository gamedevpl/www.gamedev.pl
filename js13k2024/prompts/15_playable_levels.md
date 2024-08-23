# The problem of level playability

We need to fix a problem in the gameplay. Currently on some levels the monster can spawn at a random position which makes it impossible to finish the level. Also some combinations of initial bonuses, their positions, and initial positions of monsters make it impossible to progress. It will frustrate the user

Here are the problems I have noticed:

- Level4: second monster spawns almost next to the crusher bonus, and it is not possible to finish the level even though I successfuly collect the crusher bonus as intended. The second monster should not spawn so close to crusher bonus.
- Level5: I can get to the time bomb bonus, activate it, but the second monster very often spawns very close to me, and I'm not able to finish the level. The monster should not spawn close to bomb
- Level8: This level is not possible to complete most of the time, I activate the land mine, and can't get monsters to step on it. Also I don't know how to make use of the builder bonus. Perhaps there should be no monsters initially to let me build a trap for them.
- Level9: I can't even step on the invisibility bonus. The monsters are too close initially. Monsters should be more far away. The goal should be surrounded with obstacles, and I should use invisibility to sneak to bomb to trigger it.
- Level10: The crusher bonus is to close to monster and I can't pick it up, but even if I would use it I don't understand what would be the benefit. Lets replace this level with other concept: Climber and Tsunami combo. The goal for player will be to collect tsunami bonus, and then go for climber, to get on obstacle and let monster die from tsunami.
- Level11: Builder bonus is too close. Lets change the idea of this level. Instead of current setup we could have goal spot in one of the corners of the level, and Blaster bonus to collect, and also Slide bonus to collect.
- Level12: I don't understand what is the idea with this setup, and how to play it. Perhaps this level should be the final pre-made setup before the final level 13. First of all the initial position monster position should not be se close to player.

## Level 13

This level requires additional refactor. My idea is to start from blank grid (no bonuses, no obstacles), player would start from one corner, and the goal would be on opposite corner. Bonuses will be spawned at the same time as monster spawns. The bottom line of all spawns would be to allow the player play the level continously to max up the score. So they should be getting enough of bonuses, and adequate bonuses to either eliminate monsters or protect from monsters. It means that the monster and bonus spawn should have a logic that understands how to not eliminate player with monster spawn, and also which bonus to spawn in order to let player progress.

# Final words

First of all update level definitions for levels 4,5,8,9,10,11 and 12. Then think how to implement the improvements for level13. You need to implement the monster spawn logic, and bonus spawn logic. Levels 1-12 should have fixed bonuses, and level 13 should have dynamic bonuses. Monster spawn logic should work for all levels.

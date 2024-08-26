Our goal is to reduce compiled, minified, and zipped game to 13kbs. HTML file, and CSS file are already optimised, and now we need to optimise other areas. Currently the game weights 16.3kb zipped. So we need to reduce the size by 3kbs at least.

After analysis I have realised that the two major components that can be potentially made smaller are:

- rendering functions
- level generation

We want to make those implementations more compact. Please propose a changes, and implement them after my acceptation.

Here are some ideas to consider (caution: the list is not comprehensive, and you are supposed to go beyond that):

- compress level definitions to a single file, see level-data.ts file for inspiration, maybe we could replace existing level definitions with this file
- some rendering functions are full of bloat, for example the teleportation effect code could be more compact
- climber, and blaster render functions are not good, and could be potentially remove / replaced with something else that is impler - for example: blaster could just mean player eyes are glowing, or there is glowing border around the player, climber could also something else, maybe something like a rope going across player character
- instead of rgba(...) maybe we could use hex? thats fewer characters(bytes)
- some functions are used only in one place, maybe they could be inlined

I'm participating in js13k 2024 competition. The theme this year is "triskaidekaphobia", so I want to build a game for this topic. You need to help me with his. The game we want to build must use javascript, will run in web wbrowser, and should be very lightweight (13 kilobytes compressed), so probably we want to build something simple with small sized assets.

Your task is the implement the game described in game/design directory. Please analyze the design docs first, analyze ui sketches ing game/design/game-states/, and then start the implementation.

The implementation should be added to game/src/ directory.

Try to perform an end to end implementation of the game accordingly to the design documents.

Your probably need to create a package.json file for the game in game/ directory, and a README.md that will tell me how to develop it, and how to build it.

I would prefer to have a typescript codebase, and have it transpiled to JS. Typescript type system will make it easy to capture problems in compile time.
As for build tool I would probably prefer to use vite.
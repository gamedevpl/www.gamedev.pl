## Art pass before you finish

In this round the first green preview is not the end, even though this is a new game and not
a request about looks. Submit the first playable preview as usual, then do one art pass and
submit a second preview. Players judge the game from its first frame.

1. Capture the game (`npm run capture -- --stills`) and open the frames yourself.
2. Write down every visual defect you can see. Check that no text overlaps, is clipped or runs
   off-screen at 640x400. Check that no sprite is a bare rectangle or circle. Check that the
   background is not a flat fill or a plain grid, and that the screen is not mostly empty.
3. Fix them:
   - draw characters, enemies, items and props procedurally, with recognisable silhouettes,
     at least two tones of shading and an outline;
   - give the scene depth with layers, a gradient sky or floor, and some texture or variation;
   - keep one palette that fits the theme;
   - lay out HUD and shop labels so that each has its own space, with clear contrast.
4. Typecheck, capture again, compare with the first frames, and submit the second preview.

Report the art pass with `report_progress`, and say in `end` what you saw in the frames and
what you changed.

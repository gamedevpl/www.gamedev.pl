# Summary

Refactor SectorRender to HTML5 Canvas

# Description

The goal of this task is to replace the existing implementation of BulkRender for SectorRender with equivalent html5 canvas based implementation.

Currently the sector rendering is using <BulkRender> component to render a list of sectors with <SectorRender>.
This implementation is suboptimal as it generates a lot of elements in DOM.
HTML5 canvas implementation will be faster as it will result in only one DOM element which is updated only once (sectors are not changing during the game).

## Implementation hints

- The new render component should take a list of sectors as an property
- New render component should use React.memo, it should basically never re-render (React-wise)
- New render component implement the point/unpoint functionality from <SectorCanvas>, but now it should calculate the sector which is pointed and unpointed. (previous implementation relied on DOM events per sector)
- <canvas> element dimensions should be calculated using the sector data, get min left, top, max bottom, right from sector rects, and calculate the width and height of the world mape and therefore the canvas size.
- <WorldStateRender> component should be adjusted accordingly
- Old component can be deleted

# Assets Generator

Assets generator tool can create assets for games:

- characters, animations
- visual effects

Asset is a code that is responsible for rendering the asset.

## How it works

1. Define the asset, describe it in detail
2. Execute generator
3. Generator creates asset
4. Asset is rendered
5. Generator analyses the asset rendering outcome
6. Go back to point 3 (or stop iteration)
7. Asset code is created

## Reference Images

Assets can specify reference images that serve as inspiration and reference points for the generation process. Reference images help the generator create assets that better match the desired style and appearance.

### How to Use Reference Images

1. Place your reference image in the asset's directory (e.g., `src/assets/my-asset/reference.png`)
2. Specify the reference image in your asset's configuration:

```typescript
export const MyAsset: Asset = {
  name: 'my-asset',
  description: `Asset description...`,
  referenceImage: 'reference.png', // Relative to asset directory
  render(ctx: CanvasRenderingContext2D): void {
    // Rendering implementation
  }
};
```

The reference image will be used by the generator to:
- Compare visual style and proportions
- Analyze key elements and features
- Guide improvements in the generation process
- Ensure consistency with the desired outcome

### Best Practices

- Use clear, high-quality reference images
- Place reference images in the same directory as the asset
- Use relative paths in the referenceImage property
- Consider using multiple iterations with reference image guidance

# Architecture

Assets generator tool is implemented as a genaicode plugin, it introduces some additional actions to genaicode:

- Asset definition and description
- Reference image support for visual guidance
- Automated rendering and assessment
- Iterative improvement process
-
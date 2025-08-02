# Tribe

**Tribe** is a browser-based strategy/simulation game developed as part of the Gamedev.pl open source initiative.

🎮 **[Play the game online](https://www.gamedev.pl/games/tribe/)**

## Getting Started

1. **Install dependencies:**
   ```
   npm install
   ```
2. **Run the development server:**
   ```
   npm run start
   ```
3. Open your browser and navigate to the displayed local URL.

## Project Structure

- `src/components/` – UI components for the game
- `src/game/` – Core game logic and mechanics
- `src/context/` – React context for global state management
- `src/hooks/` – Custom React hooks
- `src/styles/` – Styling and CSS

For more information about the game design, see [GAME_DESIGN_DOCUMENT_MVP.md](GAME_DESIGN_DOCUMENT_MVP.md).

## Contributing

Pull requests and suggestions are welcome! Please open an issue to discuss your ideas.

## Assets

This game uses assets from the **Sprout Lands Asset Pack** by **Cup Nooble**.
- Asset Pack: [Sprout Lands Asset Pack](https://cupnooble.itch.io/sprout-lands-asset-pack)
- Creator: Cup Nooble
- Used under license for berry bush sprites

The Sprout Lands assets enhance the visual experience of the game by replacing procedural graphics with hand-crafted pixel art. Currently integrated:

### Visual Assets
- **Berry Bush Sprites**: Hand-drawn berry bush sprites replace the original procedural circular berry bushes, featuring detailed foliage and realistic berry placement.

### Technical Implementation
The game includes a new image asset loading system (`src/game/assets/`) that:
- Loads image assets asynchronously during game initialization
- Provides fallback to procedural rendering if assets fail to load
- Integrates seamlessly with the existing sound asset system
- Uses modern web technologies (SVG data URLs) for compatibility

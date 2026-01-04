import { GameWorldState } from '../world-types';
import { indexWorldState } from '../world-index/world-state-index';
import { updatePlantingZoneConnections } from '../utils/planting-zone-connections-utils';
import { workerManager } from './persistence-worker-manager';
import { SerializedWorldState } from './persistence-types';

/**
 * Saves the current game state to IndexedDB with GZIP compression.
 * This operation is performed in a Web Worker to avoid blocking the main thread.
 * @param gameState The game state to save.
 */
export async function saveGame(worldState: GameWorldState): Promise<void> {
  try {
    const serialized: SerializedWorldState = {
      time: worldState.time,
      entities: worldState.entities,
      visualEffects: worldState.visualEffects,
      nextVisualEffectId: worldState.nextVisualEffectId,
      scheduledEvents: worldState.scheduledEvents,
      nextScheduledEventId: worldState.nextScheduledEventId,
      mapDimensions: worldState.mapDimensions,
      generationCount: worldState.generationCount,
      gameOver: worldState.gameOver,
      viewportCenter: worldState.viewportCenter,
      isPaused: worldState.isPaused,
      exitConfirmation: worldState.exitConfirmation,
      autopilotControls: worldState.autopilotControls,
      buildMenuOpen: worldState.buildMenuOpen,
      tribeModalOpen: worldState.tribeModalOpen,
      cameraFollowingPlayer: worldState.cameraFollowingPlayer,
      cameraZoom: worldState.cameraZoom,
      isDraggingMinimap: worldState.isDraggingMinimap,
      minimapDragDistance: worldState.minimapDragDistance,
      selectedBuildingType: worldState.selectedBuildingType,
      selectedBuildingForRemoval: worldState.selectedBuildingForRemoval,
      hasPlayerMovedEver: worldState.hasPlayerMovedEver,
      hasPlayerPlantedBush: worldState.hasPlayerPlantedBush,
      hasPlayerEnabledAutopilot: worldState.hasPlayerEnabledAutopilot,
      masterVolume: worldState.masterVolume,
      isMuted: worldState.isMuted,
      uiButtons: worldState.uiButtons,
      tutorial: worldState.tutorial,
      tutorialState: worldState.tutorialState,
      notifications: worldState.notifications,
      ecosystem: worldState.ecosystem,
      soilDepletion: worldState.soilDepletion,
      debugPanel: worldState.debugPanel,
      debugPanelScroll: worldState.debugPanelScroll,
      isDraggingDebugPanel: worldState.isDraggingDebugPanel,
      performanceMetrics: worldState.performanceMetrics,
      lastAutosaveTime: worldState.lastAutosaveTime,
      plantingZoneConnections: worldState.plantingZoneConnections,
      terrainOwnership: worldState.terrainOwnership,
      temperature: worldState.temperature,
      tasks: worldState.tasks,
      isDraggingViewport: worldState.isDraggingViewport,
      viewportDragButton: worldState.viewportDragButton,
      viewportDragDistance: worldState.viewportDragDistance,
    };

    await workerManager.saveGame(serialized);
  } catch (error) {
    console.error('Failed to save game:', error);
    // Optional: Bubble error up so UI can show a toast
    throw error;
  }
}

/**
 * Loads the game state from IndexedDB.
 * Decompression and parsing are performed in a Web Worker.
 * Post-load operations (indexing, planting zone connections) are done on the main thread.
 * @returns The loaded game state, or null if no saved game is found or if an error occurs.
 */
export async function loadGame(): Promise<GameWorldState | null> {
  try {
    const serializedState = await workerManager.loadGame();

    if (!serializedState) {
      return null;
    }

    console.log('Game loaded successfully.');

    // Deserialize and prepare the game state
    const gameState = serializedState as unknown as GameWorldState;

    // Ensure plantingZoneConnections exists for older saves
    if (!gameState.plantingZoneConnections) {
      gameState.plantingZoneConnections = {};
    }

    // Re-index the world state (must be done on main thread)
    const indexedGameState = indexWorldState(gameState);

    // Recalculate planting zone connections after loading
    // This ensures connections are properly set even for older save files
    updatePlantingZoneConnections(indexedGameState);

    return indexedGameState;
  } catch (error) {
    console.error('Failed to load game:', error);
    // If loading fails (e.g. corruption), clear the save
    await clearSavedGame();
    return null;
  }
}

/**
 * Clears any saved game state from IndexedDB.
 * This operation is performed in a Web Worker.
 */
export async function clearSavedGame(): Promise<void> {
  try {
    await workerManager.clearSavedGame();
  } catch (error) {
    console.error('Failed to clear saved game:', error);
  }
}

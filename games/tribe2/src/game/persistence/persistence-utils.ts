import { SavedGameState, SerializedWorldState } from './persistence-types';
import { GameWorldState } from '../world-types';
import { indexWorldState } from '../world-index/world-state-index';
import { updatePlantingZoneConnections } from '../utils/planting-zone-connections-utils';

const DB_NAME = 'tribe-game-db';
const STORE_NAME = 'save-files';
const SAVE_GAME_STORAGE_KEY = 'tribe-game-save'; // This is now the IDB Key
const CURRENT_SAVE_VERSION = 1;

/**
 * Saves the current game state to IndexedDB with GZIP compression.
 * @param gameState The game state to save.
 */
export async function saveGame(gameState: GameWorldState): Promise<void> {
  try {
    const savedGameState: SavedGameState = {
      version: CURRENT_SAVE_VERSION,
      savedAt: Date.now(),
      gameState: serializedWorldState(gameState),
    };

    // 1. Serialize to JSON string
    const jsonString = JSON.stringify(savedGameState);

    // 2. Compress to Blob
    const compressedBlob = await compressString(jsonString);

    // 3. Store Blob in IndexedDB
    await dbPut(SAVE_GAME_STORAGE_KEY, compressedBlob);

    console.log(`Game saved successfully. Size: ${(compressedBlob.size / 1024).toFixed(2)} KB`);
  } catch (error) {
    console.error('Failed to save game:', error);
    // Optional: Bubble error up so UI can show a toast
    throw error;
  }
}

/**
 * Loads the game state from IndexedDB.
 * @returns The loaded game state, or null if no saved game is found or if an error occurs.
 */
export async function loadGame(): Promise<GameWorldState | null> {
  try {
    // 1. Get Blob from IndexedDB
    const blob = await dbGet<Blob>(SAVE_GAME_STORAGE_KEY);

    if (!blob) {
      return null;
    }

    // 2. Decompress Blob to JSON string
    const jsonString = await decompressBlob(blob);

    // 3. Parse JSON
    const savedGameState: SavedGameState = JSON.parse(jsonString);

    if (savedGameState.version !== CURRENT_SAVE_VERSION) {
      console.warn(
        `Save game version mismatch. Expected ${CURRENT_SAVE_VERSION}, found ${savedGameState.version}. Discarding save.`,
      );
      await clearSavedGame();
      return null;
    }

    console.log('Game loaded successfully.');

    // Re-index the world state
    const indexedGameState = indexWorldState(readWorldState(savedGameState.gameState));

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
 */
export async function clearSavedGame(): Promise<void> {
  try {
    await dbDelete(SAVE_GAME_STORAGE_KEY);
    console.log('Saved game cleared.');
  } catch (error) {
    console.error('Failed to clear saved game:', error);
  }
}

// --- Logic Helpers ---

function readWorldState(serialized: SerializedWorldState): GameWorldState {
  const gameState = serialized as unknown as GameWorldState;
  // Ensure plantingZoneConnections exists for older saves
  if (!gameState.plantingZoneConnections) {
    gameState.plantingZoneConnections = {};
  }
  return gameState;
}

function serializedWorldState(worldState: GameWorldState): SerializedWorldState {
  return worldState as SerializedWorldState;
}

// --- Compression Helpers (Native Streams) ---

async function compressString(str: string): Promise<Blob> {
  const stream = new Blob([str]).stream();
  const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
  const response = new Response(compressedStream);
  return await response.blob();
}

async function decompressBlob(blob: Blob): Promise<string> {
  const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

// --- IndexedDB Low-Level Wrapper (No external deps) ---

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbPut(key: string, value: any): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(value, key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function dbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbDelete(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

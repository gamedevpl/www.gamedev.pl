/**
 * Web Worker for handling game persistence operations off the main thread.
 * This worker performs heavy operations like JSON serialization, GZIP compression,
 * and IndexedDB access without blocking the game's rendering and update loop.
 */

import {
  WorkerMessage,
  WorkerMessageType,
  SaveRequest,
  LoadRequest,
  ClearRequest,
  SaveResponse,
  LoadResponse,
  ClearResponse,
  SavedGameState,
} from './persistence-types';

// Constants for IndexedDB and save management
const DB_NAME = 'tribe-game-db';
const STORE_NAME = 'save-files';
const SAVE_GAME_STORAGE_KEY = 'tribe-game-save';
const CURRENT_SAVE_VERSION = 1;

// --- IndexedDB Helper Functions ---

/**
 * Opens the IndexedDB database, creating it if it doesn't exist.
 * @returns Promise that resolves with the database instance.
 */
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

/**
 * Stores a value in IndexedDB.
 * @param key The key to store the value under.
 * @param value The value to store.
 */
async function dbPut(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(value, key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieves a value from IndexedDB.
 * @param key The key to retrieve.
 * @returns The stored value, or undefined if not found.
 */
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

/**
 * Deletes a value from IndexedDB.
 * @param key The key to delete.
 */
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

// --- Compression Helper Functions ---

/**
 * Compresses a string using GZIP compression.
 * @param str The string to compress.
 * @returns A compressed Blob.
 */
async function compressString(str: string): Promise<Blob> {
  const stream = new Blob([str]).stream();
  const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
  const response = new Response(compressedStream);
  return await response.blob();
}

/**
 * Decompresses a GZIP-compressed Blob back to a string.
 * @param blob The compressed Blob.
 * @returns The decompressed string.
 */
async function decompressBlob(blob: Blob): Promise<string> {
  const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

// --- Message Handlers ---

/**
 * Handles a save request from the main thread.
 * Serializes the game state to JSON, compresses it, and stores it in IndexedDB.
 * @param request The save request message.
 */
async function handleSaveRequest(request: SaveRequest): Promise<void> {
  try {
    const savedGameState: SavedGameState = {
      version: CURRENT_SAVE_VERSION,
      savedAt: Date.now(),
      gameState: request.gameState,
    };

    // 1. Serialize to JSON string
    const jsonString = JSON.stringify(savedGameState);

    // 2. Compress to Blob
    const compressedBlob = await compressString(jsonString);

    // 3. Store Blob in IndexedDB
    await dbPut(SAVE_GAME_STORAGE_KEY, compressedBlob);

    const sizeKB = (compressedBlob.size / 1024).toFixed(2);
    console.log(`[Worker] Game saved successfully. Size: ${sizeKB} KB`);

    // Send success response
    const response: SaveResponse = {
      type: WorkerMessageType.SAVE_RESPONSE,
      id: request.id,
      success: true,
      size: compressedBlob.size,
    };
    self.postMessage(response);
  } catch (error) {
    console.error('[Worker] Failed to save game:', error);
    const response: SaveResponse = {
      type: WorkerMessageType.SAVE_RESPONSE,
      id: request.id,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    self.postMessage(response);
  }
}

/**
 * Handles a load request from the main thread.
 * Loads the compressed game state from IndexedDB, decompresses it, and sends it back.
 * @param request The load request message.
 */
async function handleLoadRequest(request: LoadRequest): Promise<void> {
  try {
    // 1. Get Blob from IndexedDB
    const blob = await dbGet<Blob>(SAVE_GAME_STORAGE_KEY);

    if (!blob) {
      console.log('[Worker] No saved game found.');
      const response: LoadResponse = {
        type: WorkerMessageType.LOAD_RESPONSE,
        id: request.id,
        success: true,
        gameState: undefined,
      };
      self.postMessage(response);
      return;
    }

    // 2. Decompress Blob to JSON string
    const jsonString = await decompressBlob(blob);

    // 3. Parse JSON
    const savedGameState: SavedGameState = JSON.parse(jsonString);

    if (savedGameState.version !== CURRENT_SAVE_VERSION) {
      console.warn(
        `[Worker] Save game version mismatch. Expected ${CURRENT_SAVE_VERSION}, found ${savedGameState.version}. Discarding save.`,
      );
      await dbDelete(SAVE_GAME_STORAGE_KEY);
      const response: LoadResponse = {
        type: WorkerMessageType.LOAD_RESPONSE,
        id: request.id,
        success: true,
        gameState: undefined,
      };
      self.postMessage(response);
      return;
    }

    console.log('[Worker] Game loaded successfully.');

    // Send success response with game state
    const response: LoadResponse = {
      type: WorkerMessageType.LOAD_RESPONSE,
      id: request.id,
      success: true,
      gameState: savedGameState.gameState,
    };
    self.postMessage(response);
  } catch (error) {
    console.error('[Worker] Failed to load game:', error);
    // If loading fails, try to clear the corrupted save
    try {
      await dbDelete(SAVE_GAME_STORAGE_KEY);
    } catch (clearError) {
      console.error('[Worker] Failed to clear corrupted save:', clearError);
    }
    const response: LoadResponse = {
      type: WorkerMessageType.LOAD_RESPONSE,
      id: request.id,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    self.postMessage(response);
  }
}

/**
 * Handles a clear request from the main thread.
 * Deletes the saved game from IndexedDB.
 * @param request The clear request message.
 */
async function handleClearRequest(request: ClearRequest): Promise<void> {
  try {
    await dbDelete(SAVE_GAME_STORAGE_KEY);
    console.log('[Worker] Saved game cleared.');

    const response: ClearResponse = {
      type: WorkerMessageType.CLEAR_RESPONSE,
      id: request.id,
      success: true,
    };
    self.postMessage(response);
  } catch (error) {
    console.error('[Worker] Failed to clear saved game:', error);
    const response: ClearResponse = {
      type: WorkerMessageType.CLEAR_RESPONSE,
      id: request.id,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    self.postMessage(response);
  }
}

// --- Message Listener ---

/**
 * Main message handler for the worker.
 * Routes incoming messages to the appropriate handler based on message type.
 */
self.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  try {
    switch (message.type) {
      case WorkerMessageType.SAVE_REQUEST:
        handleSaveRequest(message as SaveRequest);
        break;
      case WorkerMessageType.LOAD_REQUEST:
        handleLoadRequest(message as LoadRequest);
        break;
      case WorkerMessageType.CLEAR_REQUEST:
        handleClearRequest(message as ClearRequest);
        break;
      default:
        console.error('[Worker] Unknown message type:', message);
        break;
    }
  } catch (error) {
    console.error('[Worker] Error handling message:', error);
  }
});

console.log('[Worker] Persistence worker initialized.');

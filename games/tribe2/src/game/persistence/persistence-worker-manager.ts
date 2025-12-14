/**
 * Manager for the persistence worker.
 * Handles communication between the main thread and the worker,
 * queues operations, and provides a Promise-based API.
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
  SerializedWorldState,
} from './persistence-types';
import { GameWorldState } from '../world-types';

/**
 * Manages the persistence worker and handles communication with it.
 */
class PersistenceWorkerManager {
  private worker: Worker | null = null;
  private pendingRequests: Map<string, { resolve: (value?: unknown) => void; reject: (reason?: Error) => void }> =
    new Map();
  private requestQueue: Array<() => Promise<void>> = [];
  private isProcessing: boolean = false;
  private nextRequestId: number = 0;

  constructor() {
    this.initializeWorker();
  }

  /**
   * Initializes the worker and sets up message handlers.
   */
  private initializeWorker(): void {
    try {
      // Create the worker using Vite's worker import syntax
      this.worker = new Worker(new URL('./persistence-worker.ts', import.meta.url), {
        type: 'module',
      });

      // Handle messages from the worker
      this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        this.handleWorkerMessage(event.data);
      };

      // Handle worker errors
      this.worker.onerror = (error) => {
        console.error('[WorkerManager] Worker error:', error);
        // Reject all pending requests
        this.pendingRequests.forEach(({ reject }) => {
          reject(new Error('Worker encountered an error'));
        });
        this.pendingRequests.clear();
      };

      console.log('[WorkerManager] Persistence worker initialized.');
    } catch (error) {
      console.error('[WorkerManager] Failed to initialize worker:', error);
      this.worker = null;
    }
  }

  /**
   * Handles messages received from the worker.
   * @param message The message from the worker.
   */
  private handleWorkerMessage(message: WorkerMessage): void {
    const pending = this.pendingRequests.get(message.id);
    if (!pending) {
      console.warn('[WorkerManager] Received response for unknown request:', message.id);
      return;
    }

    this.pendingRequests.delete(message.id);

    switch (message.type) {
      case WorkerMessageType.SAVE_RESPONSE:
        this.handleSaveResponse(message as SaveResponse, pending);
        break;
      case WorkerMessageType.LOAD_RESPONSE:
        this.handleLoadResponse(message as LoadResponse, pending);
        break;
      case WorkerMessageType.CLEAR_RESPONSE:
        this.handleClearResponse(message as ClearResponse, pending);
        break;
      default:
        console.error('[WorkerManager] Unknown response type:', message);
        pending.reject(new Error('Unknown response type'));
        break;
    }
  }

  /**
   * Handles a save response from the worker.
   */
  private handleSaveResponse(
    response: SaveResponse,
    pending: { resolve: () => void; reject: (reason?: Error) => void },
  ): void {
    if (response.success) {
      pending.resolve();
    } else {
      pending.reject(new Error(response.error || 'Save failed'));
    }
  }

  /**
   * Handles a load response from the worker.
   */
  private handleLoadResponse(
    response: LoadResponse,
    pending: { resolve: (value: SerializedWorldState | undefined) => void; reject: (reason?: Error) => void },
  ): void {
    if (response.success) {
      pending.resolve(response.gameState);
    } else {
      pending.reject(new Error(response.error || 'Load failed'));
    }
  }

  /**
   * Handles a clear response from the worker.
   */
  private handleClearResponse(
    response: ClearResponse,
    pending: { resolve: () => void; reject: (reason?: Error) => void },
  ): void {
    if (response.success) {
      pending.resolve();
    } else {
      pending.reject(new Error(response.error || 'Clear failed'));
    }
  }

  /**
   * Generates a unique request ID.
   * @returns A unique request ID string.
   */
  private generateRequestId(): string {
    return `req_${this.nextRequestId++}_${Date.now()}`;
  }

  /**
   * Sends a message to the worker and returns a promise that resolves with the response.
   * @param message The message to send to the worker.
   * @returns A promise that resolves with the response data.
   */
  private sendMessage<T>(message: WorkerMessage): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not initialized'));
        return;
      }

      this.pendingRequests.set(message.id, { resolve: resolve as (value: unknown) => void, reject });

      try {
        this.worker.postMessage(message);
      } catch (error) {
        this.pendingRequests.delete(message.id);
        reject(error);
      }
    });
  }

  /**
   * Queues an operation to be processed sequentially.
   * @param operation The operation to queue.
   * @returns A promise that resolves when the operation completes.
   */
  private queueOperation<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          const result = await operation();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      // Start processing if not already processing
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  /**
   * Processes the request queue sequentially.
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.requestQueue.length > 0) {
      const operation = this.requestQueue.shift();
      if (operation) {
        try {
          await operation();
        } catch (error) {
          console.error('[WorkerManager] Error processing queued operation:', error);
        }
      }
    }

    this.isProcessing = false;
  }

  /**
   * Saves the game state to persistent storage via the worker.
   * @param gameState The game state to save.
   * @returns A promise that resolves when the save is complete.
   */
  public saveGame(gameState: GameWorldState): Promise<void> {
    return this.queueOperation(async () => {
      const requestId = this.generateRequestId();
      const serializedState = gameState as unknown as SerializedWorldState;

      const request: SaveRequest = {
        type: WorkerMessageType.SAVE_REQUEST,
        id: requestId,
        gameState: serializedState,
      };

      await this.sendMessage<void>(request);
    });
  }

  /**
   * Loads the game state from persistent storage via the worker.
   * @returns A promise that resolves with the loaded game state, or null if no save exists.
   */
  public loadGame(): Promise<SerializedWorldState | null> {
    return this.queueOperation(async () => {
      const requestId = this.generateRequestId();

      const request: LoadRequest = {
        type: WorkerMessageType.LOAD_REQUEST,
        id: requestId,
      };

      const gameState = await this.sendMessage<SerializedWorldState | undefined>(request);
      return gameState ?? null;
    });
  }

  /**
   * Clears the saved game state from persistent storage via the worker.
   * @returns A promise that resolves when the clear is complete.
   */
  public clearSavedGame(): Promise<void> {
    return this.queueOperation(async () => {
      const requestId = this.generateRequestId();

      const request: ClearRequest = {
        type: WorkerMessageType.CLEAR_REQUEST,
        id: requestId,
      };

      await this.sendMessage<void>(request);
    });
  }
}

/**
 * Singleton instance of the persistence worker manager.
 */
export const workerManager = new PersistenceWorkerManager();

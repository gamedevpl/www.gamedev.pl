import React, { RefObject } from 'react';
import { GRID_CENTER_X, GRID_CENTER_Y } from '../../../battle/consts';

interface GridInteractionHandlerProps {
  canvasRef: RefObject<HTMLCanvasElement>;
  cellWidth: number;
  cellHeight: number;
  isPlayerArea: boolean;
  onCellClick: (col: number, row: number) => void;
  onMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onMouseUp: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  onTouchStart: (e: React.TouchEvent<HTMLCanvasElement>) => void;
  onTouchMove: (e: React.TouchEvent<HTMLCanvasElement>) => void;
  onTouchEnd: (e: React.TouchEvent<HTMLCanvasElement>) => void;
}

interface Coordinates {
  x: number;
  y: number;
}

export class GridInteractionHandler {
  /**
   * Get all event handlers for grid interactions
   */
  static getEventHandlers(props: GridInteractionHandlerProps) {
    const {
      canvasRef,
      cellWidth,
      cellHeight,
      isPlayerArea,
      onCellClick,
      onMouseDown,
      onMouseMove,
      onMouseUp,
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    } = props;

    return {
      onClick: (event: React.MouseEvent<HTMLCanvasElement>) =>
        this.handleCanvasClick(event, { canvasRef, cellWidth, cellHeight, isPlayerArea, onCellClick }),
      onMouseDown: (event: React.MouseEvent<HTMLCanvasElement>) => this.handleMouseEvent(event, onMouseDown),
      onMouseMove: (event: React.MouseEvent<HTMLCanvasElement>) => this.handleMouseEvent(event, onMouseMove),
      onMouseUp: (event: React.MouseEvent<HTMLCanvasElement>) => this.handleMouseEvent(event, onMouseUp),
      onTouchStart: (event: React.TouchEvent<HTMLCanvasElement>) => {
        this.handleTouchEvent(event, onTouchStart);
        // Handle unit selection on touch start
        this.handleTouch(event, { canvasRef, cellWidth, cellHeight, isPlayerArea, onCellClick });
      },
      onTouchMove: (event: React.TouchEvent<HTMLCanvasElement>) => this.handleTouchEvent(event, onTouchMove),
      onTouchEnd: (event: React.TouchEvent<HTMLCanvasElement>) => this.handleTouchEvent(event, onTouchEnd),
    } as const;
  }

  /**
   * Handle canvas click event and convert to grid coordinates
   */
  private static handleCanvasClick(
    event: React.MouseEvent<HTMLCanvasElement>,
    props: {
      canvasRef: RefObject<HTMLCanvasElement>;
      cellWidth: number;
      cellHeight: number;
      isPlayerArea: boolean;
      onCellClick: (col: number, row: number) => void;
    },
  ): void {
    const { canvasRef, cellWidth, cellHeight, isPlayerArea, onCellClick } = props;

    if (!isPlayerArea) return; // Only allow interactions in the player area

    const canvas = canvasRef.current;
    if (!canvas) return;

    const coords = this.getMouseCoordinates(event, canvas);
    const { col, row } = this.calculateGridPosition(coords, cellWidth, cellHeight);
    onCellClick(col, row);
  }

  /**
   * Handle touch events for unit selection
   */
  private static handleTouch(
    event: React.TouchEvent<HTMLCanvasElement>,
    props: {
      canvasRef: RefObject<HTMLCanvasElement>;
      cellWidth: number;
      cellHeight: number;
      isPlayerArea: boolean;
      onCellClick: (col: number, row: number) => void;
    },
  ): void {
    const { canvasRef, cellWidth, cellHeight, isPlayerArea, onCellClick } = props;

    if (!isPlayerArea) return; // Only allow interactions in the player area

    const canvas = canvasRef.current;
    if (!canvas) return;

    const coords = this.getTouchCoordinates(event, canvas);
    if (!coords) return;

    const { col, row } = this.calculateGridPosition(coords, cellWidth, cellHeight);
    onCellClick(col, row);
  }

  /**
   * Handle mouse events with proper coordinate conversion
   */
  private static handleMouseEvent(
    event: React.MouseEvent<HTMLCanvasElement>,
    handler: (event: React.MouseEvent<HTMLCanvasElement>) => void,
  ): void {
    event.preventDefault();
    handler(event);
  }

  /**
   * Handle touch events with proper coordinate conversion
   */
  private static handleTouchEvent(
    event: React.TouchEvent<HTMLCanvasElement>,
    handler: (event: React.TouchEvent<HTMLCanvasElement>) => void,
  ): void {
    event.preventDefault();
    handler(event);
  }

  /**
   * Get mouse coordinates relative to canvas
   */
  private static getMouseCoordinates(
    event: React.MouseEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement,
  ): Coordinates {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  /**
   * Convert touch coordinates to canvas coordinates
   */
  static getTouchCoordinates(
    event: React.TouchEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement,
  ): Coordinates | null {
    const touch = event.touches[0] || event.changedTouches[0];
    if (!touch) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (touch.clientX - rect.left) * scaleX,
      y: (touch.clientY - rect.top) * scaleY,
    };
  }

  /**
   * Calculate grid position from coordinates
   */
  private static calculateGridPosition(
    coords: Coordinates,
    cellWidth: number,
    cellHeight: number,
  ): { col: number; row: number } {
    return {
      col: Math.floor(coords.x / cellWidth) - GRID_CENTER_X,
      row: Math.floor(coords.y / cellHeight) - GRID_CENTER_Y,
    };
  }

  /**
   * Check if coordinates are within the grid bounds
   */
  static isWithinBounds(col: number, row: number, maxCol: number, maxRow: number): boolean {
    return (
      col >= -GRID_CENTER_X && col < maxCol - GRID_CENTER_X && row >= -GRID_CENTER_Y && row < maxRow - GRID_CENTER_Y
    );
  }

  /**
   * Get normalized coordinates that are guaranteed to be within grid bounds
   */
  static getNormalizedCoordinates(
    col: number,
    row: number,
    maxCol: number,
    maxRow: number,
  ): { col: number; row: number } {
    return {
      col: Math.max(-GRID_CENTER_X, Math.min(maxCol - GRID_CENTER_X - 1, col)),
      row: Math.max(-GRID_CENTER_Y, Math.min(maxRow - GRID_CENTER_Y - 1, row)),
    };
  }
}

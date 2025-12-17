/**
 * Custom hooks for the Scenario Editor state management.
 */
import { useState, useCallback } from 'react';
import {
  ScenarioEditorState,
  ScenarioConfig,
  ScenarioTribe,
  ScenarioHuman,
  EditorTool,
  createInitialEditorState,
  generateScenarioId,
} from '../../game/scenario-editor/scenario-types';
import { exportScenarioAsJson, exportScenarioAsTypeScript, copyToClipboard } from '../../game/scenario-editor/scenario-export';
import { Vector2D } from '../../game/utils/math-types';
import { BuildingType } from '../../game/entities/buildings/building-types';

/**
 * Hook for managing toast notifications.
 */
export function useToast() {
  const [toast, setToast] = useState<string>('');

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(''), 2000);
  }, []);

  return { toast, showToast };
}

/**
 * Hook for managing the editor state.
 */
export function useEditorState() {
  const [editorState, setEditorState] = useState<ScenarioEditorState>(createInitialEditorState);

  const updateConfig = useCallback((updates: Partial<ScenarioConfig>) => {
    setEditorState((prev) => ({
      ...prev,
      config: { ...prev.config, ...updates },
    }));
  }, []);

  const setSelectedTool = useCallback((tool: EditorTool) => {
    setEditorState((prev) => ({ ...prev, selectedTool: tool }));
  }, []);

  const setSelectedTribeId = useCallback((tribeId: string | null) => {
    setEditorState((prev) => ({ ...prev, selectedTribeId: tribeId }));
  }, []);

  const setViewportCenter = useCallback((center: Vector2D) => {
    setEditorState((prev) => ({ ...prev, viewportCenter: center }));
  }, []);

  const setZoom = useCallback((newZoom: number) => {
    setEditorState((prev) => ({ ...prev, zoom: Math.max(0.25, Math.min(4, newZoom)) }));
  }, []);

  return {
    editorState,
    updateConfig,
    setSelectedTool,
    setSelectedTribeId,
    setViewportCenter,
    setZoom,
  };
}

/**
 * Hook for entity creation actions.
 */
export function useEntityActions(
  config: ScenarioConfig,
  updateConfig: (updates: Partial<ScenarioConfig>) => void,
  selectedTribeId: string | null,
  showToast: (message: string) => void,
) {
  const [newTribeBadge, setNewTribeBadge] = useState<string>('🔥');
  const [humanAge, setHumanAge] = useState<number>(16);
  const [humanGender, setHumanGender] = useState<'male' | 'female'>('male');
  const [buildingType, setBuildingType] = useState<BuildingType>('storageSpot');

  const addTribe = useCallback(
    (position: Vector2D): string => {
      const newTribe: ScenarioTribe = {
        id: generateScenarioId(),
        badge: newTribeBadge,
        position,
        humans: [],
      };
      updateConfig({ tribes: [...config.tribes, newTribe] });
      showToast(`Tribe ${newTribeBadge} added`);
      return newTribe.id;
    },
    [config.tribes, updateConfig, showToast, newTribeBadge],
  );

  const addHuman = useCallback(
    (position: Vector2D, isLeader: boolean = false) => {
      if (!selectedTribeId) {
        showToast('Select a tribe first!');
        return;
      }

      const newHuman: ScenarioHuman = {
        id: generateScenarioId(),
        gender: humanGender,
        age: humanAge,
        isPlayer: false,
        isLeader,
        position,
        tribeId: selectedTribeId,
      };

      const updatedTribes = config.tribes.map((tribe) => {
        if (tribe.id === selectedTribeId) {
          return { ...tribe, humans: [...tribe.humans, newHuman] };
        }
        return tribe;
      });

      updateConfig({ tribes: updatedTribes });
      showToast(`Human added to tribe`);
    },
    [selectedTribeId, config.tribes, updateConfig, showToast, humanAge, humanGender],
  );

  const addBerryBush = useCallback(
    (position: Vector2D) => {
      const newBush = {
        id: generateScenarioId(),
        position,
      };
      updateConfig({ berryBushes: [...config.berryBushes, newBush] });
      showToast('Berry bush added');
    },
    [config.berryBushes, updateConfig, showToast],
  );

  const addPrey = useCallback(
    (position: Vector2D) => {
      const newPrey = {
        id: generateScenarioId(),
        gender: (Math.random() < 0.5 ? 'male' : 'female') as 'male' | 'female',
        position,
      };
      updateConfig({ prey: [...config.prey, newPrey] });
      showToast('Prey added');
    },
    [config.prey, updateConfig, showToast],
  );

  const addPredator = useCallback(
    (position: Vector2D) => {
      const newPredator = {
        id: generateScenarioId(),
        gender: (Math.random() < 0.5 ? 'male' : 'female') as 'male' | 'female',
        position,
      };
      updateConfig({ predators: [...config.predators, newPredator] });
      showToast('Predator added');
    },
    [config.predators, updateConfig, showToast],
  );

  const addBuilding = useCallback(
    (position: Vector2D) => {
      if (!selectedTribeId) {
        showToast('Select a tribe first!');
        return;
      }

      const newBuilding = {
        id: generateScenarioId(),
        type: buildingType,
        position,
        tribeId: selectedTribeId,
        isConstructed: true,
      };
      updateConfig({ buildings: [...config.buildings, newBuilding] });
      showToast('Building added');
    },
    [selectedTribeId, buildingType, config.buildings, updateConfig, showToast],
  );

  const setPlayerStart = useCallback(
    (position: Vector2D) => {
      updateConfig({ playerStartPosition: position });
      showToast('Player start position set');
    },
    [updateConfig, showToast],
  );

  return {
    // Settings
    newTribeBadge,
    setNewTribeBadge,
    humanAge,
    setHumanAge,
    humanGender,
    setHumanGender,
    buildingType,
    setBuildingType,
    // Actions
    addTribe,
    addHuman,
    addBerryBush,
    addPrey,
    addPredator,
    addBuilding,
    setPlayerStart,
  };
}

/**
 * Hook for auto-populate actions.
 */
export function useAutoPopulateActions(
  config: ScenarioConfig,
  updateConfig: (updates: Partial<ScenarioConfig>) => void,
  showToast: (message: string) => void,
) {
  const handleAutoPopulateBushes = useCallback(
    (count: number) => {
      const newBushes = [];
      for (let i = 0; i < count; i++) {
        newBushes.push({
          id: generateScenarioId(),
          position: {
            x: Math.random() * config.mapWidth,
            y: Math.random() * config.mapHeight,
          },
        });
      }
      updateConfig({ berryBushes: [...config.berryBushes, ...newBushes] });
      showToast(`Added ${count} berry bushes`);
    },
    [config.mapWidth, config.mapHeight, config.berryBushes, updateConfig, showToast],
  );

  const handleAutoPopulatePrey = useCallback(
    (count: number) => {
      const newPrey = [];
      for (let i = 0; i < count; i++) {
        newPrey.push({
          id: generateScenarioId(),
          gender: (Math.random() < 0.5 ? 'male' : 'female') as 'male' | 'female',
          position: {
            x: Math.random() * config.mapWidth,
            y: Math.random() * config.mapHeight,
          },
        });
      }
      updateConfig({ prey: [...config.prey, ...newPrey] });
      showToast(`Added ${count} prey`);
    },
    [config.mapWidth, config.mapHeight, config.prey, updateConfig, showToast],
  );

  const handleAutoPopulatePredators = useCallback(
    (count: number) => {
      const newPredators = [];
      for (let i = 0; i < count; i++) {
        newPredators.push({
          id: generateScenarioId(),
          gender: (Math.random() < 0.5 ? 'male' : 'female') as 'male' | 'female',
          position: {
            x: Math.random() * config.mapWidth,
            y: Math.random() * config.mapHeight,
          },
        });
      }
      updateConfig({ predators: [...config.predators, ...newPredators] });
      showToast(`Added ${count} predators`);
    },
    [config.mapWidth, config.mapHeight, config.predators, updateConfig, showToast],
  );

  return {
    handleAutoPopulateBushes,
    handleAutoPopulatePrey,
    handleAutoPopulatePredators,
  };
}

/**
 * Hook for export actions.
 */
export function useExportActions(config: ScenarioConfig, showToast: (message: string) => void) {
  const handleExportJson = useCallback(async () => {
    const json = exportScenarioAsJson(config);
    const success = await copyToClipboard(json);
    if (success) {
      showToast('JSON copied to clipboard!');
    } else {
      showToast('Failed to copy');
    }
  }, [config, showToast]);

  const handleExportTs = useCallback(async () => {
    const ts = exportScenarioAsTypeScript(config);
    const success = await copyToClipboard(ts);
    if (success) {
      showToast('TypeScript copied to clipboard!');
    } else {
      showToast('Failed to copy');
    }
  }, [config, showToast]);

  return { handleExportJson, handleExportTs };
}

/**
 * Hook for canvas interaction (panning, zooming, coordinate conversion).
 */
export function useCanvasInteraction(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  viewportCenter: Vector2D,
  zoom: number,
  setViewportCenter: (center: Vector2D) => void,
  setZoom: (zoom: number) => void,
) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Vector2D>({ x: 0, y: 0 });

  const screenToWorld = useCallback(
    (screenX: number, screenY: number): Vector2D => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };

      const rect = canvas.getBoundingClientRect();
      const canvasX = screenX - rect.left;
      const canvasY = screenY - rect.top;

      const worldX = viewportCenter.x + (canvasX - canvas.width / 2) / zoom;
      const worldY = viewportCenter.y + (canvasY - canvas.height / 2) / zoom;

      return { x: worldX, y: worldY };
    },
    [canvasRef, viewportCenter, zoom],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>, selectedTool: EditorTool) => {
      if (e.button === 1 || (e.button === 0 && selectedTool === 'pan')) {
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
      }
    },
    [],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isDragging) {
        const dx = (e.clientX - dragStart.x) / zoom;
        const dy = (e.clientY - dragStart.y) / zoom;
        setViewportCenter({
          x: viewportCenter.x - dx,
          y: viewportCenter.y - dy,
        });
        setDragStart({ x: e.clientX, y: e.clientY });
      }
    },
    [isDragging, dragStart, zoom, viewportCenter, setViewportCenter],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(zoom * zoomDelta);
    },
    [zoom, setZoom],
  );

  return {
    isDragging,
    screenToWorld,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
  };
}

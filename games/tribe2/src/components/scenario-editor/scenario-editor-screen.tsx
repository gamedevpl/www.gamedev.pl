/**
 * Main Scenario Editor Screen component.
 * Provides a visual interface for creating and editing game scenarios.
 * This is the main composition component that brings together the canvas,
 * sidebar, and all the hooks for state management.
 */
import React, { useRef, useState, useCallback } from 'react';
import { useGameContext } from '../../context/game-context';
import { Vector2D } from '../../game/utils/math-types';
import * as S from './scenario-editor-styles';
import { ScenarioEditorCanvas } from './scenario-editor-canvas';
import { ScenarioEditorSidebar } from './scenario-editor-sidebar';
import {
  useToast,
  useEditorState,
  useEntityActions,
  useAutoPopulateActions,
  useExportActions,
  useCanvasInteraction,
  useSimulationActions,
  useStartGameActions,
} from './scenario-editor-hooks';

export const ScenarioEditorScreen: React.FC = () => {
  const { setAppState, saveCurrentGame } = useGameContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [worldPos, setWorldPos] = useState<Vector2D>({ x: 0, y: 0 });

  // Use custom hooks for state management
  const { toast, showToast } = useToast();
  const { editorState, updateConfig, setSelectedTool, setSelectedTribeId, setViewportCenter, setZoom } =
    useEditorState();

  const { config, selectedTool, selectedTribeId, viewportCenter, zoom } = editorState;

  // Entity creation actions
  const entityActions = useEntityActions(config, updateConfig, selectedTribeId, showToast);

  // Auto-populate actions
  const autoPopulateActions = useAutoPopulateActions(config, updateConfig, showToast);

  // Simulation actions
  const simulationActions = useSimulationActions(config, updateConfig, showToast);

  // Start game actions
  const startGameActions = useStartGameActions(config, showToast, saveCurrentGame, setAppState);

  // Export actions
  const exportActions = useExportActions(config, showToast);

  // Canvas interaction (panning, zooming, coordinate conversion)
  const canvasInteraction = useCanvasInteraction(canvasRef, viewportCenter, zoom, setViewportCenter, setZoom);

  // Handle canvas click - route to appropriate action based on selected tool
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (canvasInteraction.isDragging) return;

      const worldPosition = canvasInteraction.screenToWorld(e.clientX, e.clientY);

      switch (selectedTool) {
        case 'addTribe': {
          const newTribeId = entityActions.addTribe(worldPosition);
          setSelectedTribeId(newTribeId);
          break;
        }
        case 'addHuman':
          entityActions.addHuman(worldPosition, e.shiftKey);
          break;
        case 'addBerryBush':
          entityActions.addBerryBush(worldPosition);
          break;
        case 'addPrey':
          entityActions.addPrey(worldPosition);
          break;
        case 'addPredator':
          entityActions.addPredator(worldPosition);
          break;
        case 'addBuilding':
          entityActions.addBuilding(worldPosition);
          break;
        case 'setPlayerStart':
          entityActions.setPlayerStart(worldPosition);
          break;
        case 'select':
        case 'delete':
        case 'pan':
          // These tools don't have click actions yet
          break;
      }
    },
    [canvasInteraction, selectedTool, entityActions, setSelectedTribeId],
  );

  // Handle mouse events for canvas
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      canvasInteraction.handleMouseDown(e, selectedTool);
    },
    [canvasInteraction, selectedTool],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      setWorldPos(canvasInteraction.screenToWorld(e.clientX, e.clientY));
      canvasInteraction.handleMouseMove(e);
    },
    [canvasInteraction],
  );

  return (
    <S.EditorContainer>
      <ScenarioEditorCanvas
        config={config}
        viewportCenter={viewportCenter}
        zoom={zoom}
        selectedTool={selectedTool}
        selectedTribeId={selectedTribeId}
        worldPos={worldPos}
        onCanvasClick={handleCanvasClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={canvasInteraction.handleMouseUp}
        onWheel={canvasInteraction.handleWheel}
        onZoomIn={() => setZoom(zoom * 1.2)}
        onZoomOut={() => setZoom(zoom / 1.2)}
        onZoomReset={() => setZoom(1)}
        canvasRef={canvasRef}
      />

      <ScenarioEditorSidebar
        config={config}
        selectedTool={selectedTool}
        selectedTribeId={selectedTribeId}
        onUpdateConfig={updateConfig}
        onSetSelectedTool={setSelectedTool}
        onSetSelectedTribeId={setSelectedTribeId}
        onBack={() => setAppState('intro')}
        newTribeBadge={entityActions.newTribeBadge}
        onSetNewTribeBadge={entityActions.setNewTribeBadge}
        humanGender={entityActions.humanGender}
        onSetHumanGender={entityActions.setHumanGender}
        humanAge={entityActions.humanAge}
        onSetHumanAge={entityActions.setHumanAge}
        buildingType={entityActions.buildingType}
        onSetBuildingType={entityActions.setBuildingType}
        onAutoPopulateBushes={autoPopulateActions.handleAutoPopulateBushes}
        onAutoPopulatePrey={autoPopulateActions.handleAutoPopulatePrey}
        onAutoPopulatePredators={autoPopulateActions.handleAutoPopulatePredators}
        onSimulate={simulationActions.handleSimulate}
        onStartContinuousSimulation={simulationActions.handleStartContinuousSimulation}
        onStopSimulation={simulationActions.handleStopSimulation}
        isSimulating={simulationActions.isSimulating}
        isContinuousSimulation={simulationActions.isContinuousSimulation}
        simulationProgress={simulationActions.simulationProgress}
        onStartGame={startGameActions.handleStartGame}
        isStartingGame={startGameActions.isStarting}
        onExportJson={exportActions.handleExportJson}
        onExportTs={exportActions.handleExportTs}
      />

      <S.ToastMessage $visible={!!toast}>{toast}</S.ToastMessage>
    </S.EditorContainer>
  );
};

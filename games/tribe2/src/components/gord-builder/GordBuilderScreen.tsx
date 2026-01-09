import React from 'react';
import styled from 'styled-components';
import { useGameContext } from '../../context/game-context';
import { useGordBuilder } from './use-gord-builder';
import { GordCanvas } from './GordCanvas';
import { GordSidebar } from './GordSidebar';
import { GORD_MIN_CELLS } from '../../game/ai-consts';

const ScreenContainer = styled.div`
  display: flex;
  width: 100vw;
  height: 100vh;
  background-color: #1a1a1a;
  color: white;
  font-family: 'Arial', sans-serif;
`;

const CanvasContainer = styled.div`
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
`;

const Description = styled.p`
  margintop: 20px;
  color: #888;
  maxwidth: 600px;
  textalign: center;
  font-size: 0.9rem;
  line-height: 1.4;
`;

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

export const GordBuilderScreen: React.FC = () => {
  const { returnToIntro } = useGameContext();
  const builder = useGordBuilder(CANVAS_WIDTH, CANVAS_HEIGHT);

  return (
    <ScreenContainer>
      <GordSidebar
        selectedType={builder.selectedType}
        hubBuildings={builder.hubBuildings}
        plannedGordEdges={builder.plannedGordEdges}
        gordStats={builder.gordStats}
        showPlannedGord={builder.showPlannedGord}
        showTerritoryGrid={builder.showTerritoryGrid}
        showGordGrid={builder.showGordGrid}
        onSelectType={builder.setSelectedType}
        onPlanGord={builder.planGord}
        onExecutePlan={builder.executeGordPlan}
        onAutoPlace={builder.autoPlaceSingleBuilding}
        onClear={builder.clearBuildings}
        onToggleShowPlannedGord={builder.setShowPlannedGord}
        onToggleShowTerritoryGrid={builder.setShowTerritoryGrid}
        onToggleShowGordGrid={builder.setShowGordGrid}
        onBack={returnToIntro}
      />
      <CanvasContainer>
        <GordCanvas
          canvasWidth={CANVAS_WIDTH}
          canvasHeight={CANVAS_HEIGHT}
          placedBuildings={builder.placedBuildings}
          terrainOwnership={builder.terrainOwnership}
          showTerritoryGrid={builder.showTerritoryGrid}
          showGordGrid={builder.showGordGrid}
          showPlannedGord={builder.showPlannedGord}
          plannedGordEdges={builder.plannedGordEdges}
          mousePos={builder.mousePos}
          selectedType={builder.selectedType}
          onClick={builder.handleCanvasClick}
          onMouseMove={builder.handleMouseMove}
          onMouseLeave={() => builder.setMousePos(null)}
        />
        <Description>
          <strong>Simplified Gord Planning:</strong> Perimeters are now based on 100px grid cells.
          <br />A cell is eligible if it meets the ownership threshold. Clusters must have at least {
            GORD_MIN_CELLS
          }{' '}
          cells.
        </Description>
      </CanvasContainer>
    </ScreenContainer>
  );
};

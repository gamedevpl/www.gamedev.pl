import React from 'react';
import styled from 'styled-components';
import { BuildingType, BUILDING_DEFINITIONS } from '../../game/entities/buildings/building-consts';
import { BuildingEntity } from '../../game/entities/buildings/building-types';
import { GORD_GRID_RESOLUTION, GORD_MIN_GATE_DISTANCE_PX } from '../../game/ai/task/tribes/gord-boundary-utils';
import { GORD_MIN_CELLS } from '../../game/ai-consts';
import { GordPlanStats, PlannedGordEdge } from './types';

const Sidebar = styled.div`
  width: 300px;
  height: 100%;
  background-color: #222;
  border-right: 1px solid #444;
  display: flex;
  flex-direction: column;
  padding: 20px;
  overflow-y: auto;
`;

const Title = styled.h1`
  font-size: 1.5rem;
  margin-bottom: 20px;
  text-align: center;
  color: white;
`;

const SectionTitle = styled.h2`
  font-size: 1rem;
  margin: 15px 0 10px;
  color: #aaa;
`;

const Button = styled.button`
  background-color: #444;
  color: white;
  border: none;
  padding: 10px;
  margin-bottom: 10px;
  cursor: pointer;
  border-radius: 4px;
  text-align: left;
  transition: background-color 0.2s;

  &:hover {
    background-color: #666;
  }

  &:active {
    background-color: #888;
  }

  &:disabled {
    background-color: #333;
    color: #666;
    cursor: not-allowed;
  }
`;

const BackButton = styled(Button)`
  background-color: #833;
  margin-top: auto;
  text-align: center;
  font-weight: bold;

  &:hover {
    background-color: #a44;
  }
`;

const CheckboxLabel = styled.label`
  display: flex;
  align-items: center;
  margin-bottom: 10px;
  cursor: pointer;
  color: #ddd;

  input {
    margin-right: 8px;
  }
`;

const InfoText = styled.p`
  font-size: 0.85rem;
  color: #888;
  margin: 5px 0;
`;

const QualityBadge = styled.span<{ $rating: 'Excellent' | 'Good' | 'Fair' | 'Poor' }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: bold;
  font-size: 0.75rem;
  background-color: ${(props) => {
    switch (props.$rating) {
      case 'Excellent':
        return '#2a5';
      case 'Good':
        return '#28a';
      case 'Fair':
        return '#a82';
      case 'Poor':
        return '#a33';
    }
  }};
  color: white;
`;

interface GordSidebarProps {
  selectedType: BuildingType;
  hubBuildings: BuildingEntity[];
  plannedGordEdges: PlannedGordEdge[];
  gordStats: GordPlanStats | null;
  showPlannedGord: boolean;
  showTerritoryGrid: boolean;
  showGordGrid: boolean;
  onSelectType: (type: BuildingType) => void;
  onPlanGord: () => void;
  onExecutePlan: () => void;
  onAutoPlace: () => void;
  onClear: () => void;
  onToggleShowPlannedGord: (val: boolean) => void;
  onToggleShowTerritoryGrid: (val: boolean) => void;
  onToggleShowGordGrid: (val: boolean) => void;
  onBack: () => void;
}

export const GordSidebar: React.FC<GordSidebarProps> = ({
  selectedType,
  hubBuildings,
  plannedGordEdges,
  gordStats,
  showPlannedGord,
  showTerritoryGrid,
  showGordGrid,
  onSelectType,
  onPlanGord,
  onExecutePlan,
  onAutoPlace,
  onClear,
  onToggleShowPlannedGord,
  onToggleShowTerritoryGrid,
  onToggleShowGordGrid,
  onBack,
}) => {
  return (
    <Sidebar>
      <Title>Gord Builder Test</Title>

      <SectionTitle>1. Place Hub Buildings</SectionTitle>
      <Button
        onClick={() => onSelectType(BuildingType.Bonfire)}
        style={{
          backgroundColor: selectedType === BuildingType.Bonfire ? '#666' : '#444',
          borderLeft: selectedType === BuildingType.Bonfire ? '3px solid #FF6600' : 'none',
        }}
      >
        {BUILDING_DEFINITIONS[BuildingType.Bonfire].icon} Bonfire (Hub)
      </Button>
      <Button
        onClick={() => onSelectType(BuildingType.StorageSpot)}
        style={{
          backgroundColor: selectedType === BuildingType.StorageSpot ? '#666' : '#444',
          borderLeft: selectedType === BuildingType.StorageSpot ? '3px solid #FF6600' : 'none',
        }}
      >
        {BUILDING_DEFINITIONS[BuildingType.StorageSpot].icon} Storage (Hub)
      </Button>

      <SectionTitle>2. Manual Placement</SectionTitle>
      <Button
        onClick={() => onSelectType(BuildingType.Palisade)}
        style={{
          backgroundColor: selectedType === BuildingType.Palisade ? '#666' : '#444',
          borderLeft: selectedType === BuildingType.Palisade ? '3px solid #4CAF50' : 'none',
        }}
      >
        {BUILDING_DEFINITIONS[BuildingType.Palisade].icon} Palisade
      </Button>
      <Button
        onClick={() => onSelectType(BuildingType.Gate)}
        style={{
          backgroundColor: selectedType === BuildingType.Gate ? '#666' : '#444',
          borderLeft: selectedType === BuildingType.Gate ? '3px solid #4CAF50' : 'none',
        }}
      >
        {BUILDING_DEFINITIONS[BuildingType.Gate].icon} Gate
      </Button>

      <SectionTitle>3. AI Gord Planning</SectionTitle>
      <InfoText>Grid Resolution: {GORD_GRID_RESOLUTION}px</InfoText>
      <InfoText>Min Cluster Size: {GORD_MIN_CELLS} cells</InfoText>
      <InfoText>Min Gate Dist: {GORD_MIN_GATE_DISTANCE_PX}px</InfoText>
      <Button
        onClick={onPlanGord}
        style={{ backgroundColor: hubBuildings.length > 0 ? '#2a5' : '#555', textAlign: 'center' }}
        disabled={hubBuildings.length === 0}
      >
        🏰 Plan Gord ({hubBuildings.length} hubs)
      </Button>
      <Button
        onClick={onExecutePlan}
        style={{ backgroundColor: plannedGordEdges.length > 0 ? '#25a' : '#555', textAlign: 'center' }}
        disabled={plannedGordEdges.length === 0}
      >
        ✅ Execute Plan ({plannedGordEdges.length} edges)
      </Button>

      <SectionTitle>Gord Statistics</SectionTitle>
      {gordStats ? (
        <>
          <InfoText>
            🎯 Quality: <QualityBadge $rating={gordStats.qualityRating}>{gordStats.qualityRating}</QualityBadge>
          </InfoText>
          <InfoText>
            🏠 Hubs: {gordStats.hubCount} | 🧱 Palis: {gordStats.palisadeCount} | 🚪 Gates: {gordStats.gateCount}
          </InfoText>
          <InfoText>
            📏 Perimeter: {gordStats.perimeterLength}px | 📐 Area: ~{gordStats.enclosedArea}px²
          </InfoText>
          <InfoText>🪵 Cost: {gordStats.woodCost}</InfoText>
        </>
      ) : (
        <InfoText>No gord planned. Place hubs first.</InfoText>
      )}

      <SectionTitle>Visualization</SectionTitle>
      <CheckboxLabel>
        <input type="checkbox" checked={showPlannedGord} onChange={(e) => onToggleShowPlannedGord(e.target.checked)} />{' '}
        Show Planned Gord
      </CheckboxLabel>
      <CheckboxLabel>
        <input
          type="checkbox"
          checked={showTerritoryGrid}
          onChange={(e) => onToggleShowTerritoryGrid(e.target.checked)}
        />{' '}
        Show Territory
      </CheckboxLabel>
      <CheckboxLabel>
        <input type="checkbox" checked={showGordGrid} onChange={(e) => onToggleShowGordGrid(e.target.checked)} /> Show
        Gord Grid
      </CheckboxLabel>

      <SectionTitle>Actions</SectionTitle>
      <Button onClick={onAutoPlace} style={{ backgroundColor: '#357', textAlign: 'center' }}>
        🎯 Auto-Place Single
      </Button>
      <Button onClick={onClear} style={{ backgroundColor: '#a33', textAlign: 'center' }}>
        🗑️ Clear All
      </Button>

      <BackButton onClick={onBack}>Back to Intro</BackButton>
    </Sidebar>
  );
};

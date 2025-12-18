/**
 * Sidebar component for the Scenario Editor.
 * Contains all control panels for scenario configuration.
 */
import React from 'react';
import { ScenarioConfig, EditorTool, AVAILABLE_BADGES } from '../../game/scenario-editor/scenario-types';
import { MAP_WIDTH, MAP_HEIGHT } from '../../game/game-consts';
import { BuildingType } from '../../game/entities/buildings/building-types';
import * as S from './scenario-editor-styles';

interface ScenarioEditorSidebarProps {
  config: ScenarioConfig;
  selectedTool: EditorTool;
  selectedTribeId: string | null;
  // Callbacks for updating config
  onUpdateConfig: (updates: Partial<ScenarioConfig>) => void;
  onSetSelectedTool: (tool: EditorTool) => void;
  onSetSelectedTribeId: (tribeId: string | null) => void;
  onBack: () => void;
  // Entity settings
  newTribeBadge: string;
  onSetNewTribeBadge: (badge: string) => void;
  humanGender: 'male' | 'female';
  onSetHumanGender: (gender: 'male' | 'female') => void;
  humanAge: number;
  onSetHumanAge: (age: number) => void;
  buildingType: BuildingType;
  onSetBuildingType: (type: BuildingType) => void;
  // Auto-populate callbacks
  onAutoPopulateBushes: (count: number) => void;
  onAutoPopulatePrey: (count: number) => void;
  onAutoPopulatePredators: (count: number) => void;
  // Simulation callbacks
  onSimulate: (durationGameHours: number) => void;
  onStartContinuousSimulation: () => void;
  onStopSimulation: () => void;
  isSimulating: boolean;
  isContinuousSimulation: boolean;
  simulationProgress: number;
  // Start game callback
  onStartGame: () => void;
  isStartingGame: boolean;
  // Export callbacks
  onExportJson: () => void;
  onExportTs: () => void;
  onExportSchema: () => void;
  onImportJson: () => void;
  // Chrome AI callbacks
  aiAvailability: 'readily' | 'after-download' | 'no' | 'unsupported';
  aiStatusMessage: string;
  isGeneratingWithAI: boolean;
  aiPromptInput: string;
  onSetAiPromptInput: (value: string) => void;
  onGenerateWithAI: () => void;
}

export const ScenarioEditorSidebar: React.FC<ScenarioEditorSidebarProps> = ({
  config,
  selectedTool,
  selectedTribeId,
  onUpdateConfig,
  onSetSelectedTool,
  onSetSelectedTribeId,
  onBack,
  newTribeBadge,
  onSetNewTribeBadge,
  humanGender,
  onSetHumanGender,
  humanAge,
  onSetHumanAge,
  buildingType,
  onSetBuildingType,
  onAutoPopulateBushes,
  onAutoPopulatePrey,
  onAutoPopulatePredators,
  onSimulate,
  onStartContinuousSimulation,
  onStopSimulation,
  isSimulating,
  isContinuousSimulation,
  simulationProgress,
  onStartGame,
  isStartingGame,
  onExportJson,
  onExportTs,
  onExportSchema,
  onImportJson,
  aiAvailability,
  aiStatusMessage,
  isGeneratingWithAI,
  aiPromptInput,
  onSetAiPromptInput,
  onGenerateWithAI,
}) => {
  return (
    <S.Sidebar>
      <S.Header>
        <S.Title>Scenario Editor</S.Title>
        <S.BackButton onClick={onBack}>← Back</S.BackButton>
      </S.Header>

      <ScenarioInfoSection config={config} onUpdateConfig={onUpdateConfig} />
      <ToolsSection selectedTool={selectedTool} onSetSelectedTool={onSetSelectedTool} />
      <TribeSettingsSection
        config={config}
        selectedTribeId={selectedTribeId}
        newTribeBadge={newTribeBadge}
        onSetNewTribeBadge={onSetNewTribeBadge}
        onSetSelectedTribeId={onSetSelectedTribeId}
      />
      <HumanSettingsSection
        humanGender={humanGender}
        onSetHumanGender={onSetHumanGender}
        humanAge={humanAge}
        onSetHumanAge={onSetHumanAge}
      />
      <BuildingSettingsSection buildingType={buildingType} onSetBuildingType={onSetBuildingType} />
      <AutoPopulateSection
        onAutoPopulateBushes={onAutoPopulateBushes}
        onAutoPopulatePrey={onAutoPopulatePrey}
        onAutoPopulatePredators={onAutoPopulatePredators}
      />
      <SimulationSection
        onSimulate={onSimulate}
        onStartContinuousSimulation={onStartContinuousSimulation}
        onStopSimulation={onStopSimulation}
        isSimulating={isSimulating}
        isContinuousSimulation={isContinuousSimulation}
        simulationProgress={simulationProgress}
      />
      <StartGameSection onStartGame={onStartGame} isStartingGame={isStartingGame} />
      <SummarySection config={config} />
      <ExportSection onExportJson={onExportJson} onExportTs={onExportTs} onExportSchema={onExportSchema} onImportJson={onImportJson} />
      <ChromeAISection
        aiAvailability={aiAvailability}
        aiStatusMessage={aiStatusMessage}
        isGenerating={isGeneratingWithAI}
        promptInput={aiPromptInput}
        onSetPromptInput={onSetAiPromptInput}
        onGenerate={onGenerateWithAI}
      />
    </S.Sidebar>
  );
};

// --- Sub-components for each sidebar section ---

interface ScenarioInfoSectionProps {
  config: ScenarioConfig;
  onUpdateConfig: (updates: Partial<ScenarioConfig>) => void;
}

const ScenarioInfoSection: React.FC<ScenarioInfoSectionProps> = ({ config, onUpdateConfig }) => (
  <S.SidebarSection>
    <S.SectionTitle>Scenario Info</S.SectionTitle>
    <S.InputGroup>
      <S.Label>Name</S.Label>
      <S.Input value={config.name} onChange={(e) => onUpdateConfig({ name: e.target.value })} />
    </S.InputGroup>
    <S.InputGroup>
      <S.Label>Description</S.Label>
      <S.TextArea value={config.description} onChange={(e) => onUpdateConfig({ description: e.target.value })} />
    </S.InputGroup>
    <S.InputGroup>
      <S.Label>Map Size</S.Label>
      <div style={{ display: 'flex', gap: '8px' }}>
        <S.Input
          type="number"
          value={config.mapWidth}
          onChange={(e) => onUpdateConfig({ mapWidth: parseInt(e.target.value) || MAP_WIDTH })}
          style={{ width: '50%' }}
        />
        <S.Input
          type="number"
          value={config.mapHeight}
          onChange={(e) => onUpdateConfig({ mapHeight: parseInt(e.target.value) || MAP_HEIGHT })}
          style={{ width: '50%' }}
        />
      </div>
    </S.InputGroup>
  </S.SidebarSection>
);

interface ToolsSectionProps {
  selectedTool: EditorTool;
  onSetSelectedTool: (tool: EditorTool) => void;
}

const ToolsSection: React.FC<ToolsSectionProps> = ({ selectedTool, onSetSelectedTool }) => (
  <S.SidebarSection>
    <S.SectionTitle>Tools</S.SectionTitle>
    <S.ToolGrid>
      <S.ToolButton $active={selectedTool === 'select'} onClick={() => onSetSelectedTool('select')}>
        Select
      </S.ToolButton>
      <S.ToolButton $active={selectedTool === 'pan'} onClick={() => onSetSelectedTool('pan')}>
        Pan
      </S.ToolButton>
      <S.ToolButton $active={selectedTool === 'addTribe'} onClick={() => onSetSelectedTool('addTribe')}>
        +Tribe
      </S.ToolButton>
      <S.ToolButton $active={selectedTool === 'addHuman'} onClick={() => onSetSelectedTool('addHuman')}>
        +Human
      </S.ToolButton>
      <S.ToolButton $active={selectedTool === 'addBerryBush'} onClick={() => onSetSelectedTool('addBerryBush')}>
        +Bush
      </S.ToolButton>
      <S.ToolButton $active={selectedTool === 'addPrey'} onClick={() => onSetSelectedTool('addPrey')}>
        +Prey
      </S.ToolButton>
      <S.ToolButton $active={selectedTool === 'addPredator'} onClick={() => onSetSelectedTool('addPredator')}>
        +Predator
      </S.ToolButton>
      <S.ToolButton $active={selectedTool === 'addBuilding'} onClick={() => onSetSelectedTool('addBuilding')}>
        +Building
      </S.ToolButton>
      <S.ToolButton $active={selectedTool === 'setPlayerStart'} onClick={() => onSetSelectedTool('setPlayerStart')}>
        Player ★
      </S.ToolButton>
      <S.ToolButton $active={selectedTool === 'delete'} onClick={() => onSetSelectedTool('delete')}>
        Delete
      </S.ToolButton>
    </S.ToolGrid>
  </S.SidebarSection>
);

interface TribeSettingsSectionProps {
  config: ScenarioConfig;
  selectedTribeId: string | null;
  newTribeBadge: string;
  onSetNewTribeBadge: (badge: string) => void;
  onSetSelectedTribeId: (tribeId: string | null) => void;
}

const TribeSettingsSection: React.FC<TribeSettingsSectionProps> = ({
  config,
  selectedTribeId,
  newTribeBadge,
  onSetNewTribeBadge,
  onSetSelectedTribeId,
}) => (
  <S.SidebarSection>
    <S.SectionTitle>Tribe Settings</S.SectionTitle>
    <S.InputGroup>
      <S.Label>New Tribe Badge</S.Label>
      <S.BadgeSelector>
        {AVAILABLE_BADGES.map((badge) => (
          <S.BadgeOption key={badge} $selected={newTribeBadge === badge} onClick={() => onSetNewTribeBadge(badge)}>
            {badge}
          </S.BadgeOption>
        ))}
      </S.BadgeSelector>
    </S.InputGroup>

    <S.Label>Tribes ({config.tribes.length})</S.Label>
    <S.TribeList>
      {config.tribes.map((tribe) => (
        <S.TribeItem
          key={tribe.id}
          $selected={selectedTribeId === tribe.id}
          onClick={() => onSetSelectedTribeId(tribe.id)}
        >
          <S.TribeBadge>{tribe.badge}</S.TribeBadge>
          <S.TribeName>Tribe</S.TribeName>
          <S.TribeCount>{tribe.humans.length} humans</S.TribeCount>
        </S.TribeItem>
      ))}
    </S.TribeList>
    {config.tribes.length === 0 && <S.HelpText>Click on the map with +Tribe tool to add tribes</S.HelpText>}
  </S.SidebarSection>
);

interface HumanSettingsSectionProps {
  humanGender: 'male' | 'female';
  onSetHumanGender: (gender: 'male' | 'female') => void;
  humanAge: number;
  onSetHumanAge: (age: number) => void;
}

const HumanSettingsSection: React.FC<HumanSettingsSectionProps> = ({
  humanGender,
  onSetHumanGender,
  humanAge,
  onSetHumanAge,
}) => (
  <S.SidebarSection>
    <S.SectionTitle>Human Settings</S.SectionTitle>
    <S.InputGroup>
      <S.Label>Gender</S.Label>
      <S.Select value={humanGender} onChange={(e) => onSetHumanGender(e.target.value as 'male' | 'female')}>
        <option value="male">Male</option>
        <option value="female">Female</option>
      </S.Select>
    </S.InputGroup>
    <S.InputGroup>
      <S.Label>Age (years)</S.Label>
      <S.Input
        type="number"
        min="0"
        max="100"
        value={humanAge}
        onChange={(e) => onSetHumanAge(parseInt(e.target.value) || 0)}
      />
    </S.InputGroup>
    <S.HelpText>Hold SHIFT when placing to make the human a tribe leader</S.HelpText>
  </S.SidebarSection>
);

interface BuildingSettingsSectionProps {
  buildingType: BuildingType;
  onSetBuildingType: (type: BuildingType) => void;
}

const BuildingSettingsSection: React.FC<BuildingSettingsSectionProps> = ({ buildingType, onSetBuildingType }) => (
  <S.SidebarSection>
    <S.SectionTitle>Building Settings</S.SectionTitle>
    <S.InputGroup>
      <S.Label>Building Type</S.Label>
      <S.Select value={buildingType} onChange={(e) => onSetBuildingType(e.target.value as BuildingType)}>
        <option value="storageSpot">Storage Spot</option>
        <option value="plantingZone">Planting Zone</option>
        <option value="borderPost">Border Post</option>
      </S.Select>
    </S.InputGroup>
    <S.HelpText>Buildings claim territory (80px radius) for their tribe. Use Border Posts to expand territory.</S.HelpText>
  </S.SidebarSection>
);

interface AutoPopulateSectionProps {
  onAutoPopulateBushes: (count: number) => void;
  onAutoPopulatePrey: (count: number) => void;
  onAutoPopulatePredators: (count: number) => void;
}

const AutoPopulateSection: React.FC<AutoPopulateSectionProps> = ({
  onAutoPopulateBushes,
  onAutoPopulatePrey,
  onAutoPopulatePredators,
}) => (
  <S.SidebarSection>
    <S.SectionTitle>Auto-Populate</S.SectionTitle>
    <S.SecondaryButton onClick={() => onAutoPopulateBushes(50)}>+50 Bushes</S.SecondaryButton>
    <S.SecondaryButton onClick={() => onAutoPopulatePrey(20)}>+20 Prey</S.SecondaryButton>
    <S.SecondaryButton onClick={() => onAutoPopulatePredators(4)}>+4 Predators</S.SecondaryButton>
  </S.SidebarSection>
);

interface SimulationSectionProps {
  onSimulate: (durationGameHours: number) => void;
  onStartContinuousSimulation: () => void;
  onStopSimulation: () => void;
  isSimulating: boolean;
  isContinuousSimulation: boolean;
  simulationProgress: number;
}

const SimulationSection: React.FC<SimulationSectionProps> = ({
  onSimulate,
  onStartContinuousSimulation,
  onStopSimulation,
  isSimulating,
  isContinuousSimulation,
  simulationProgress,
}) => (
  <S.SidebarSection>
    <S.SectionTitle>Simulation</S.SectionTitle>
    <S.HelpText>Run the simulation to create a more organic state</S.HelpText>
    <S.SecondaryButton onClick={() => onSimulate(24)} disabled={isSimulating}>
      {isSimulating && !isContinuousSimulation ? `Simulating... ${simulationProgress.toFixed(0)}%` : 'Simulate 1 Day'}
    </S.SecondaryButton>
    <S.SecondaryButton onClick={() => onSimulate(168)} disabled={isSimulating}>
      {isSimulating && !isContinuousSimulation ? `Simulating... ${simulationProgress.toFixed(0)}%` : 'Simulate 1 Week'}
    </S.SecondaryButton>
    <S.SecondaryButton onClick={() => onSimulate(720)} disabled={isSimulating}>
      {isSimulating && !isContinuousSimulation ? `Simulating... ${simulationProgress.toFixed(0)}%` : 'Simulate 1 Month'}
    </S.SecondaryButton>
    <S.HelpText style={{ marginTop: '8px' }}>Or run continuously:</S.HelpText>
    {isContinuousSimulation ? (
      <S.ActionButton onClick={onStopSimulation} style={{ backgroundColor: '#c0392b' }}>
        ⏹ Stop Simulation
      </S.ActionButton>
    ) : (
      <S.SecondaryButton onClick={onStartContinuousSimulation} disabled={isSimulating}>
        ▶ Run Continuously
      </S.SecondaryButton>
    )}
  </S.SidebarSection>
);

interface StartGameSectionProps {
  onStartGame: () => void;
  isStartingGame: boolean;
}

const StartGameSection: React.FC<StartGameSectionProps> = ({ onStartGame, isStartingGame }) => (
  <S.SidebarSection>
    <S.SectionTitle>Play</S.SectionTitle>
    <S.ActionButton onClick={onStartGame} disabled={isStartingGame} style={{ backgroundColor: '#27ae60' }}>
      {isStartingGame ? 'Starting...' : '🎮 Start Game'}
    </S.ActionButton>
    <S.HelpText>Save scenario and start playing</S.HelpText>
  </S.SidebarSection>
);

interface SummarySectionProps {
  config: ScenarioConfig;
}

const SummarySection: React.FC<SummarySectionProps> = ({ config }) => (
  <S.SidebarSection>
    <S.SectionTitle>Summary</S.SectionTitle>
    <S.EntityInfo>
      Tribes: {config.tribes.length}
      <br />
      Humans: {config.tribes.reduce((sum, t) => sum + t.humans.length, 0)}
      <br />
      Berry Bushes: {config.berryBushes.length}
      <br />
      Prey: {config.prey.length}
      <br />
      Predators: {config.predators.length}
      <br />
      Buildings: {config.buildings.length}
    </S.EntityInfo>
  </S.SidebarSection>
);

interface ExportSectionProps {
  onExportJson: () => void;
  onExportTs: () => void;
  onExportSchema: () => void;
  onImportJson: () => void;
}

const ExportSection: React.FC<ExportSectionProps> = ({ onExportJson, onExportTs, onExportSchema, onImportJson }) => (
  <S.SidebarSection>
    <S.SectionTitle>Export</S.SectionTitle>
    <S.ActionButton onClick={onExportJson}>Copy as JSON</S.ActionButton>
    <S.ActionButton onClick={onExportTs}>Copy as TypeScript</S.ActionButton>
    <S.SectionTitle style={{ marginTop: '16px' }}>AI Generation</S.SectionTitle>
    <S.HelpText>Copy schema for ChatGPT/Gemini, then import the result</S.HelpText>
    <S.SecondaryButton onClick={onExportSchema}>📋 Copy Schema for AI</S.SecondaryButton>
    <S.SecondaryButton onClick={onImportJson}>📥 Import from JSON</S.SecondaryButton>
  </S.SidebarSection>
);

interface ChromeAISectionProps {
  aiAvailability: 'readily' | 'after-download' | 'no' | 'unsupported';
  aiStatusMessage: string;
  isGenerating: boolean;
  promptInput: string;
  onSetPromptInput: (value: string) => void;
  onGenerate: () => void;
}

const ChromeAISection: React.FC<ChromeAISectionProps> = ({
  aiAvailability,
  aiStatusMessage,
  isGenerating,
  promptInput,
  onSetPromptInput,
  onGenerate,
}) => (
  <S.SidebarSection>
    <S.SectionTitle>🤖 Chrome AI (Built-in)</S.SectionTitle>
    <S.HelpText>{aiStatusMessage}</S.HelpText>
    {aiAvailability === 'readily' && (
      <>
        <S.TextArea
          placeholder="Describe your scenario... e.g., 'A lone survivor starts in a desert with scarce resources, 2 small hostile tribes nearby'"
          value={promptInput}
          onChange={(e) => onSetPromptInput(e.target.value)}
          disabled={isGenerating}
          rows={3}
        />
        <S.ActionButton onClick={onGenerate} disabled={isGenerating || !promptInput.trim()}>
          {isGenerating ? '⏳ Generating...' : '✨ Generate with AI'}
        </S.ActionButton>
      </>
    )}
    {aiAvailability === 'unsupported' && (
      <S.HelpText style={{ fontSize: '11px' }}>
        Enable in chrome://flags/#prompt-api-for-gemini-nano
      </S.HelpText>
    )}
  </S.SidebarSection>
);

/**
 * Styled components for the Scenario Editor.
 */
import styled from 'styled-components';

export const EditorContainer = styled.div`
  display: flex;
  width: 100vw;
  height: 100vh;
  background-color: #1a1a2e;
  color: #fff;
  font-family: 'Press Start 2P', cursive;
  overflow: hidden;
`;

export const CanvasContainer = styled.div`
  flex: 1;
  position: relative;
  overflow: hidden;
`;

export const StyledCanvas = styled.canvas`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  cursor: crosshair;
`;

export const Sidebar = styled.div`
  width: 320px;
  background-color: #16213e;
  border-left: 2px solid #0f3460;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
`;

export const SidebarSection = styled.div`
  padding: 12px;
  border-bottom: 1px solid #0f3460;
`;

export const SectionTitle = styled.h3`
  font-size: 10px;
  margin: 0 0 10px 0;
  color: #e94560;
  text-transform: uppercase;
`;

export const ToolButton = styled.button<{ $active?: boolean }>`
  font-family: 'Press Start 2P', cursive;
  font-size: 8px;
  padding: 8px 12px;
  margin: 4px;
  background-color: ${(props) => (props.$active ? '#e94560' : '#0f3460')};
  color: #fff;
  border: 1px solid ${(props) => (props.$active ? '#ff6b6b' : '#1a1a2e')};
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background-color: ${(props) => (props.$active ? '#ff6b6b' : '#1e4d8c')};
  }
`;

export const ToolGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
`;

export const InputGroup = styled.div`
  margin-bottom: 10px;
`;

export const Label = styled.label`
  display: block;
  font-size: 8px;
  margin-bottom: 4px;
  color: #aaa;
`;

export const Input = styled.input`
  width: 100%;
  padding: 6px;
  font-family: 'Press Start 2P', cursive;
  font-size: 8px;
  background-color: #0f3460;
  color: #fff;
  border: 1px solid #1a1a2e;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: #e94560;
  }
`;

export const TextArea = styled.textarea`
  width: 100%;
  padding: 6px;
  font-family: 'Press Start 2P', cursive;
  font-size: 8px;
  background-color: #0f3460;
  color: #fff;
  border: 1px solid #1a1a2e;
  box-sizing: border-box;
  resize: vertical;
  min-height: 60px;

  &:focus {
    outline: none;
    border-color: #e94560;
  }
`;

export const Select = styled.select`
  width: 100%;
  padding: 6px;
  font-family: 'Press Start 2P', cursive;
  font-size: 8px;
  background-color: #0f3460;
  color: #fff;
  border: 1px solid #1a1a2e;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: #e94560;
  }
`;

export const ActionButton = styled.button`
  width: 100%;
  padding: 10px;
  font-family: 'Press Start 2P', cursive;
  font-size: 10px;
  background-color: #e94560;
  color: #fff;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 8px;

  &:hover {
    background-color: #ff6b6b;
  }

  &:disabled {
    background-color: #555;
    cursor: not-allowed;
  }
`;

export const SecondaryButton = styled(ActionButton)`
  background-color: #0f3460;

  &:hover {
    background-color: #1e4d8c;
  }
`;

export const TribeList = styled.div`
  max-height: 200px;
  overflow-y: auto;
`;

export const TribeItem = styled.div<{ $selected?: boolean }>`
  display: flex;
  align-items: center;
  padding: 8px;
  margin: 4px 0;
  background-color: ${(props) => (props.$selected ? '#0f3460' : 'transparent')};
  border: 1px solid ${(props) => (props.$selected ? '#e94560' : 'transparent')};
  cursor: pointer;

  &:hover {
    background-color: #0f3460;
  }
`;

export const TribeBadge = styled.span`
  font-size: 16px;
  margin-right: 8px;
`;

export const TribeName = styled.span`
  font-size: 8px;
  flex: 1;
`;

export const TribeCount = styled.span`
  font-size: 8px;
  color: #aaa;
`;

export const EntityInfo = styled.div`
  font-size: 8px;
  padding: 8px;
  background-color: #0f3460;
  margin-top: 8px;
`;

export const CoordinateDisplay = styled.div`
  position: absolute;
  bottom: 10px;
  left: 10px;
  font-size: 10px;
  background-color: rgba(0, 0, 0, 0.7);
  padding: 8px 12px;
  pointer-events: none;
`;

export const ZoomControls = styled.div`
  position: absolute;
  bottom: 10px;
  right: 10px;
  display: flex;
  gap: 4px;
`;

export const ZoomButton = styled.button`
  font-family: 'Press Start 2P', cursive;
  font-size: 12px;
  width: 32px;
  height: 32px;
  background-color: rgba(15, 52, 96, 0.9);
  color: #fff;
  border: 1px solid #1a1a2e;
  cursor: pointer;

  &:hover {
    background-color: #1e4d8c;
  }
`;

export const Header = styled.div`
  background-color: #0f3460;
  padding: 10px 15px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 2px solid #e94560;
`;

export const Title = styled.h1`
  font-size: 12px;
  margin: 0;
  color: #e94560;
`;

export const BackButton = styled.button`
  font-family: 'Press Start 2P', cursive;
  font-size: 8px;
  padding: 6px 12px;
  background-color: #e94560;
  color: #fff;
  border: none;
  cursor: pointer;

  &:hover {
    background-color: #ff6b6b;
  }
`;

export const StatusBar = styled.div`
  position: absolute;
  top: 10px;
  left: 10px;
  font-size: 10px;
  background-color: rgba(0, 0, 0, 0.7);
  padding: 8px 12px;
  pointer-events: none;
`;

export const ToastMessage = styled.div<{ $visible: boolean }>`
  position: fixed;
  bottom: 60px;
  left: 50%;
  transform: translateX(-50%);
  background-color: #0f3460;
  color: #fff;
  padding: 12px 24px;
  font-size: 10px;
  border: 1px solid #e94560;
  opacity: ${(props) => (props.$visible ? 1 : 0)};
  transition: opacity 0.3s;
  pointer-events: none;
  z-index: 1000;
`;

export const HelpText = styled.div`
  font-size: 7px;
  color: #888;
  margin-top: 4px;
  line-height: 1.5;
`;

export const BadgeSelector = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
`;

export const BadgeOption = styled.button<{ $selected?: boolean }>`
  font-size: 20px;
  padding: 4px;
  background-color: ${(props) => (props.$selected ? '#e94560' : '#0f3460')};
  border: 1px solid ${(props) => (props.$selected ? '#ff6b6b' : '#1a1a2e')};
  cursor: pointer;

  &:hover {
    background-color: #1e4d8c;
  }
`;

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import styled from 'styled-components';
import { VIEW_W, VIEW_H, GRID, BUDGET, MATERIALS, LEVEL, MaterialType } from '../game/constants';
import { Node, Beam, Camera, Message, SimState, GameMode, Tool } from '../game/types';
import { WorldSimulation, buildWorldFromDesign, stepSimulation } from '../game/physics';
import { renderBackground, renderBuild, renderSim } from '../game/render';
import {
  computeCost,
  pretty,
  snap,
  makeId,
  viewToWorld,
  findNearestNode,
  findNearestBeam,
  beamExists,
  dist,
  getInitialNodes,
  getInitialBeams,
  clamp,
} from '../game/utils';
import { useRafLoop } from '../hooks/use-raf-loop';

const GameContainer = styled.div`
  width: 100%;
  height: 100vh;
  min-height: 520px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem;
  background-color: #0b1220;
  color: #e8f0ff;
  box-sizing: border-box;
`;

const TopBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
`;

const InfoGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const InfoBox = styled.div`
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  background-color: #111c30;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  font-size: 0.6rem;

  .label {
    opacity: 0.9;
    margin-bottom: 0.25rem;
  }

  .value {
    font-weight: bold;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' | 'danger' }>`
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-family: 'Press Start 2P', cursive;
  font-size: 0.6rem;
  font-weight: bold;
  border: none;
  cursor: pointer;
  transition: all 0.2s;

  ${(props) => {
    switch (props.$variant) {
      case 'primary':
        return `
          background-color: #5de38c;
          color: #0b1220;
          &:hover { background-color: #7aefa4; }
        `;
      case 'danger':
        return `
          background-color: #ff6b6b;
          color: #0b1220;
          &:hover { background-color: #ff8888; }
        `;
      default:
        return `
          background-color: #3a4a5c;
          color: #e8f0ff;
          &:hover { background-color: #4a5a6c; }
        `;
    }
  }}
`;

const MainContent = styled.div`
  display: flex;
  flex-direction: row;
  gap: 0.5rem;
  flex: 1;
  min-height: 0;

  @media (max-width: 900px) {
    flex-direction: column;
  }
`;

const CanvasContainer = styled.div`
  flex: 1;
  border-radius: 0.5rem;
  overflow: hidden;
  background-color: #000;
  position: relative;
  min-height: 300px;
`;

const StyledCanvas = styled.canvas`
  width: 100%;
  height: 100%;
  display: block;
  cursor: crosshair;
  image-rendering: pixelated;
`;

const MessageOverlay = styled.div<{ $type: 'warn' | 'info' }>`
  position: absolute;
  left: 0.5rem;
  bottom: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.6rem;
  font-weight: bold;
  background-color: ${(props) => (props.$type === 'warn' ? '#ffcc66' : '#e8f0ff')};
  color: #0b1220;
`;

const TipsOverlay = styled.div`
  position: absolute;
  right: 0.5rem;
  bottom: 0.5rem;
  padding: 0.5rem;
  border-radius: 0.5rem;
  background-color: rgba(11, 18, 32, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 0.5rem;
  line-height: 1.6;

  .title {
    font-weight: bold;
    margin-bottom: 0.25rem;
  }

  .tip {
    opacity: 0.9;
  }
`;

const Sidebar = styled.div`
  width: 280px;
  border-radius: 0.5rem;
  background-color: #111c30;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  overflow-y: auto;

  @media (max-width: 900px) {
    width: 100%;
    flex-direction: row;
    flex-wrap: wrap;
  }
`;

const Panel = styled.div`
  border-radius: 0.5rem;
  background-color: rgba(11, 18, 32, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0.5rem;

  .panel-title {
    font-size: 0.6rem;
    opacity: 0.9;
    margin-bottom: 0.5rem;
  }

  .panel-content {
    font-size: 0.5rem;
    line-height: 1.6;
  }

  @media (max-width: 900px) {
    flex: 1;
    min-width: 200px;
  }
`;

const ToolButtons = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
`;

const ToolButton = styled.button<{ $active: boolean; $danger?: boolean }>`
  flex: 1;
  padding: 0.5rem;
  border-radius: 0.5rem;
  font-family: 'Press Start 2P', cursive;
  font-size: 0.5rem;
  font-weight: bold;
  border: none;
  cursor: pointer;
  transition: all 0.2s;

  ${(props) =>
    props.$active
      ? props.$danger
        ? `
          background-color: #ff6b6b;
          color: #0b1220;
        `
        : `
          background-color: #e8f0ff;
          color: #0b1220;
        `
      : `
          background-color: #3a4a5c;
          color: #e8f0ff;
          &:hover { background-color: #4a5a6c; }
        `}
`;

const MaterialGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  margin-top: 0.5rem;
`;

const MaterialButton = styled.button<{ $active: boolean }>`
  padding: 0.5rem;
  border-radius: 0.5rem;
  font-family: 'Press Start 2P', cursive;
  font-size: 0.45rem;
  font-weight: bold;
  border: none;
  cursor: pointer;
  transition: all 0.2s;

  ${(props) =>
    props.$active
      ? `
          background-color: #e8f0ff;
          color: #0b1220;
        `
      : `
          background-color: #3a4a5c;
          color: #e8f0ff;
          &:hover { background-color: #4a5a6c; }
        `}
`;

export const GameScreen: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const outRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<WorldSimulation | null>(null);
  const lastPointerWorldRef = useRef<{ x: number; y: number } | null>(null);

  const [mode, setMode] = useState<GameMode>('build');
  const [tool, setTool] = useState<Tool>('build');
  const [mat, setMat] = useState<MaterialType>('wood');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [simState, setSimState] = useState<SimState>({ running: false, t: 0, outcome: '' });
  const [cam, setCam] = useState<Camera>({ x: 12, y: 4.2 });
  const [nodes, setNodes] = useState<Node[]>(getInitialNodes);
  const [beams, setBeams] = useState<Beam[]>(getInitialBeams);

  const nodesById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
  const cost = useMemo(() => computeCost(nodesById, beams), [nodesById, beams]);
  const budgetLeft = BUDGET - cost;

  // Setup offscreen canvas
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const out = document.createElement('canvas');
    out.width = VIEW_W;
    out.height = VIEW_H;
    outRef.current = out;

    const resize = () => {
      const parent = c.parentElement;
      if (!parent) return;
      const r = parent.getBoundingClientRect();
      const scale = Math.floor(Math.min(r.width / VIEW_W, (r.height - 8) / VIEW_H));
      c.width = VIEW_W * Math.max(1, scale);
      c.height = VIEW_H * Math.max(1, scale);
      const ctx = c.getContext('2d');
      if (ctx) ctx.imageSmoothingEnabled = false;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Render frame
  const renderFrame = useCallback(() => {
    const c = canvasRef.current;
    const out = outRef.current;
    if (!c || !out) return;
    const octx = out.getContext('2d');
    const ctx = c.getContext('2d');
    if (!octx || !ctx) return;

    renderBackground(octx, cam);

    if (mode === 'build') {
      renderBuild(octx, cam, nodes, beams, nodesById, selectedNodeId, lastPointerWorldRef.current);
    } else {
      const sim = worldRef.current;
      if (sim) {
        renderSim(octx, cam, beams, sim);
      }
    }

    // Upscale to visible canvas
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(out, 0, 0, c.width, c.height);
  }, [cam, mode, nodes, beams, nodesById, selectedNodeId]);

  // Simulation loop
  useRafLoop(mode === 'sim', (realDt) => {
    const sim = worldRef.current;
    if (!sim) return;

    worldRef.current = stepSimulation(sim, realDt);

    // Camera follow lead car
    const lead = sim.train.cars[0].getPosition();
    setCam((c) => ({ x: clamp(lead.x + 2.0, 9, 19), y: c.y }));

    setSimState({ running: true, t: sim.t, outcome: sim.outcome });

    renderFrame();
  });

  // Initial render and re-render on state changes
  useEffect(() => {
    renderFrame();
  }, [renderFrame]);

  // Message auto-clear
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 1600);
    return () => clearTimeout(t);
  }, [message]);

  // Input handling
  const getPointerWorld = useCallback(
    (evt: React.PointerEvent<HTMLCanvasElement>) => {
      const c = canvasRef.current;
      if (!c) return null;
      const rect = c.getBoundingClientRect();
      const px = ((evt.clientX - rect.left) / rect.width) * c.width;
      const py = ((evt.clientY - rect.top) / rect.height) * c.height;

      const scaleX = c.width / VIEW_W;
      const scaleY = c.height / VIEW_H;
      const ox = px / scaleX;
      const oy = py / scaleY;

      return viewToWorld(ox, oy, cam);
    },
    [cam],
  );

  const handlePointerMove = useCallback(
    (evt: React.PointerEvent<HTMLCanvasElement>) => {
      if (mode !== 'build') return;
      const w = getPointerWorld(evt);
      if (!w) return;
      lastPointerWorldRef.current = { x: w.x, y: w.y };
      renderFrame();
    },
    [mode, getPointerWorld, renderFrame],
  );

  const addBeam = useCallback(
    (aId: string, bId: string, matKey: MaterialType) => {
      if (aId === bId) return;
      if (beamExists(beams, aId, bId)) return;
      const A = nodesById[aId];
      const B = nodesById[bId];
      if (!A || !B) return;

      const L = dist(A, B);
      const extra = MATERIALS[matKey].costPerM * L;
      if (cost + extra > BUDGET + 1e-6) {
        setMessage({ type: 'warn', text: 'Not enough budget for that beam.' });
        return;
      }

      setBeams((bs) => [...bs, { id: makeId('b'), a: aId, b: bId, mat: matKey }]);
    },
    [beams, nodesById, cost],
  );

  const removeNode = useCallback(
    (nodeId: string) => {
      const n = nodesById[nodeId];
      if (!n || n.anchor) return;

      setBeams((bs) => bs.filter((b) => b.a !== nodeId && b.b !== nodeId));
      setNodes((ns) => ns.filter((x) => x.id !== nodeId));
      if (selectedNodeId === nodeId) setSelectedNodeId(null);
    },
    [nodesById, selectedNodeId],
  );

  const removeBeam = useCallback((beamId: string) => {
    setBeams((bs) => bs.filter((b) => b.id !== beamId));
  }, []);

  const handlePointerDown = useCallback(
    (evt: React.PointerEvent<HTMLCanvasElement>) => {
      if (mode !== 'build') return;
      const w = getPointerWorld(evt);
      if (!w) return;

      const sx = snap(w.x, GRID);
      const sy = snap(w.y, GRID);

      // Limit build height
      if (sy > LEVEL.platformY + 8) {
        setMessage({ type: 'warn', text: 'Too high — keep it closer to the gap.' });
        return;
      }

      // Delete tool
      if (tool === 'delete') {
        const bn = findNearestBeam(beams, nodesById, { x: sx, y: sy });
        if (bn) {
          removeBeam(bn.id);
          renderFrame();
          return;
        }
        const nn = findNearestNode(nodes, { x: sx, y: sy });
        if (nn) {
          removeNode(nn.id);
          renderFrame();
        }
        return;
      }

      // Build tool
      const near = findNearestNode(nodes, { x: sx, y: sy });
      if (!selectedNodeId) {
        if (near) {
          setSelectedNodeId(near.id);
        } else {
          const id = makeId('n');
          setNodes((ns) => [...ns, { id, x: sx, y: sy, anchor: false }]);
          setSelectedNodeId(id);
        }
      } else {
        const from = nodesById[selectedNodeId];
        if (!from) {
          setSelectedNodeId(null);
          return;
        }
        let toId: string;
        if (near) {
          toId = near.id;
        } else {
          const id = makeId('n');
          setNodes((ns) => [...ns, { id, x: sx, y: sy, anchor: false }]);
          toId = id;
        }

        addBeam(selectedNodeId, toId, mat);
        setSelectedNodeId(toId);
      }

      renderFrame();
    },
    [
      mode,
      getPointerWorld,
      tool,
      beams,
      nodesById,
      nodes,
      selectedNodeId,
      mat,
      removeBeam,
      removeNode,
      addBeam,
      renderFrame,
    ],
  );

  const startSim = useCallback(() => {
    setSelectedNodeId(null);
    setMessage(null);

    if (cost > BUDGET + 1e-6) {
      setMessage({ type: 'warn', text: 'Over budget — remove some beams.' });
      return;
    }

    if (!beams.some((b) => b.mat === 'road')) {
      setMessage({ type: 'warn', text: 'Add some Road beams so the train has a track.' });
      return;
    }

    const sim = buildWorldFromDesign(nodes, beams);
    worldRef.current = sim;

    setCam((c) => ({ ...c, x: 10 }));
    setSimState({ running: true, t: 0, outcome: '' });
    setMode('sim');
  }, [cost, beams, nodes]);

  const stopSim = useCallback(() => {
    worldRef.current = null;
    setMode('build');
    setSimState({ running: false, t: 0, outcome: '' });
    setCam({ x: 12, y: 4.2 });
  }, []);

  const resetBuild = useCallback(() => {
    stopSim();
    setSelectedNodeId(null);
    setTool('build');
    setMat('wood');
    setNodes(getInitialNodes());
    setBeams(getInitialBeams());
  }, [stopSim]);

  return (
    <GameContainer>
      <TopBar>
        <InfoGroup>
          <InfoBox>
            <div className="label">Budget</div>
            <div className="value">
              {pretty(cost)} / {BUDGET}{' '}
              <span style={{ color: budgetLeft < 0 ? '#ff6b6b' : '#5de38c' }}>({pretty(budgetLeft)} left)</span>
            </div>
          </InfoBox>
          <InfoBox>
            <div className="label">Goal</div>
            <div className="value">Bridge survives the train</div>
          </InfoBox>
          {mode === 'sim' && (
            <InfoBox>
              <div className="label">Test</div>
              <div className="value">
                {simState.outcome
                  ? simState.outcome === 'win'
                    ? 'SUCCESS'
                    : 'COLLAPSED'
                  : `t = ${simState.t.toFixed(1)}s`}
              </div>
            </InfoBox>
          )}
        </InfoGroup>
        <ButtonGroup>
          {mode === 'build' ? (
            <Button $variant="primary" onClick={startSim}>
              ▶ Play Test
            </Button>
          ) : (
            <Button onClick={stopSim}>⟲ Back to Build</Button>
          )}
          <Button onClick={resetBuild}>Reset</Button>
        </ButtonGroup>
      </TopBar>

      <MainContent>
        <CanvasContainer>
          <StyledCanvas
            ref={canvasRef}
            onPointerMove={handlePointerMove}
            onPointerDown={handlePointerDown}
          />
          {message && <MessageOverlay $type={message.type}>{message.text}</MessageOverlay>}
          {mode === 'build' && (
            <TipsOverlay>
              <div className="title">Build tips</div>
              <div className="tip">Road = wheels roll on it</div>
              <div className="tip">Use triangles for strength</div>
              <div className="tip">Steel is strong but expensive</div>
            </TipsOverlay>
          )}
        </CanvasContainer>

        <Sidebar>
          <Panel>
            <div className="panel-title">Tool</div>
            <ToolButtons>
              <ToolButton $active={tool === 'build'} onClick={() => setTool('build')}>
                Build
              </ToolButton>
              <ToolButton
                $active={tool === 'delete'}
                $danger
                onClick={() => {
                  setTool('delete');
                  setSelectedNodeId(null);
                }}
              >
                Delete
              </ToolButton>
            </ToolButtons>
            <div className="panel-content" style={{ marginTop: '0.5rem' }}>
              {tool === 'build'
                ? 'Click to place nodes. Click node → node to connect.'
                : 'Click beams or nodes to remove.'}
            </div>
          </Panel>

          <Panel>
            <div className="panel-title">Material</div>
            <MaterialGrid>
              {(Object.entries(MATERIALS) as [MaterialType, (typeof MATERIALS)[MaterialType]][]).map(([k, m]) => (
                <MaterialButton key={k} $active={mat === k} onClick={() => setMat(k)} disabled={mode !== 'build'}>
                  {m.label}
                </MaterialButton>
              ))}
            </MaterialGrid>
            <div className="panel-content" style={{ marginTop: '0.5rem' }}>
              <div>
                <strong>Wood:</strong> cheap, breaks easier
              </div>
              <div>
                <strong>Steel:</strong> strongest, expensive
              </div>
              <div>
                <strong>Road:</strong> physical track for wheels
              </div>
            </div>
          </Panel>

          <Panel>
            <div className="panel-title">Level</div>
            <div className="panel-content">
              A train (3 cars) will drive from left to right. Your bridge must carry it across the gap. Beams break
              when the force exceeds the material limit.
            </div>
          </Panel>

          <Panel style={{ marginTop: 'auto' }}>
            <div className="panel-title">Quick start idea</div>
            <div className="panel-content">
              Keep a straight road deck, then add a triangular truss underneath. Long unsupported spans tend to snap
              when the locomotive hits.
            </div>
          </Panel>
        </Sidebar>
      </MainContent>
    </GameContainer>
  );
};

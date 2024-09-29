import { useRef, useState, useEffect } from 'react';
import { useRafLoop } from 'react-use';
import styled from 'styled-components';

import { initBattleState } from '../battle/battle-state/battle-state-init';
import { updateBattleState } from '../battle/battle-state/battle-state-update';
import { renderBattle } from '../battle/battle-render/render-battle';

export const GameStateBattle = ({ onEnd }: { onEnd: () => void }) => {
  const [battleState, setBattleState] = useState(() => initBattleState());
  const lastTimeRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
  };

  useEffect(() => {
    // Resize the canvas when the component is mounted
    resizeCanvas();

    // Add event listener to resize the canvas on window resize
    window.addEventListener('resize', resizeCanvas);

    // Clean up the event listener on component unmount
    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  useRafLoop(() => {
    const time = Date.now();
    if (lastTimeRef.current > 0) {
      const deltaTime = time - lastTimeRef.current;
      setBattleState((prevState) => updateBattleState(deltaTime, prevState));

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        renderBattle(ctx, battleState);
      }
    }

    lastTimeRef.current = time;
  });

  return (
    <>
      <RenderCanvas ref={canvasRef} style={{ display: 'block' }} />

      <BattleHUD>
        <h1>Battle in Progress</h1>
        <p>Engage in the battle and lead your units to victory.</p>
        <button
          onClick={() => {
            onEnd();
          }}
        >
          End Battle
        </button>
      </BattleHUD>
    </>
  );
};

const BattleHUD = styled.div`
  position: absolute;
  left: 0;
  top: 0;
`;

const RenderCanvas = styled.canvas`
  position: absolute;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
`;

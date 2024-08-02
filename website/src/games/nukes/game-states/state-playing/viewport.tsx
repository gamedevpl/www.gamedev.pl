import React, { useRef, useState } from 'react';
import styled from 'styled-components';
import { useGesture } from '@use-gesture/react';

export function Viewport({ children }: { children: React.ReactNode }) {
  const interactionRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isInteracting, setInteracting] = useState<boolean | undefined>(false);

  useGesture(
    {
      onPinch({ delta, pinching }) {
        setInteracting(pinching);
        setZoom(Math.max(zoom + delta[0], 0.1));
      },
      onWheel({ event, delta: [x, y], wheeling }) {
        event.preventDefault();
        setInteracting(wheeling);
        setTranslate({ x: translate.x - x / zoom, y: translate.y - y / zoom });
      },
    },
    {
      target: interactionRef,
      eventOptions: { passive: false },
    },
  );

  return (
    <ViewportContainer>
      <InteractionContainer ref={interactionRef}>
        <TransformContainer
          style={
            {
              '--zoom': zoom,
              '--translate-x': translate.x,
              '--translate-y': translate.y,
            } as React.CSSProperties
          }
          data-is-interacting={isInteracting}
        >
          {children}
        </TransformContainer>
      </InteractionContainer>
    </ViewportContainer>
  );
}

const ViewportContainer = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;

  background: black;
  overflow: hidden;
`;

const InteractionContainer = styled.div`
  /* flex-grow: 1;
          display: flex;
          flexDirection: column;
          alignItems: "center", */
  user-select: none;
  position: fixed;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
  /* WebkitUserSelect: "none", */
`;

const TransformContainer = styled.div`
  transform-origin: top center;
  transform: scale(var(--zoom)) translate3d(calc(var(--translate-x) * 1px), calc(var(--translate-y) * 1px), 0);

  &[data-is-interacting='true'] {
    pointer-events: none;
  }
`;

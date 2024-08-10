import React, { useRef, useState } from 'react';
import styled from 'styled-components';
import { useGesture } from '@use-gesture/react';
import { dispatchCustomEvent, useCustomEvent } from '../../events';

export type TranslateViewportPayload = { x: number; y: number };

export function dispatchTranslateEvent(position: TranslateViewportPayload) {
  dispatchCustomEvent('translateViewport', position);
}

export function useTranslateViewportEvent(callback: (position: TranslateViewportPayload) => void) {
  useCustomEvent('translateViewport', callback);
}

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

  useTranslateViewportEvent((position) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate the new translation to center the clicked state, considering the current zoom level
    const newTranslateX = viewportWidth / 2 - position.x * zoom;
    const newTranslateY = viewportHeight / 2 - position.y * zoom;

    setTranslate({ x: newTranslateX / zoom, y: newTranslateY / zoom });
  });

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
  user-select: none;
  position: fixed;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
`;

const TransformContainer = styled.div`
  transform-origin: 0px 0px;
  transform-style: preserve-3d;
  transform: scale(var(--zoom)) translate3d(calc(var(--translate-x) * 1px), calc(var(--translate-y) * 1px), 0);
  transition: transform 0.3s ease-out;

  &[data-is-interacting='true'] {
    pointer-events: none;
    will-change: transform;
    transition: none;
  }
`;

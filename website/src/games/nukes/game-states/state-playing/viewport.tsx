import React, { useRef, useState, useCallback, useEffect } from 'react';
import styled from 'styled-components';
import { useGesture } from '@use-gesture/react';
import { dispatchCustomEvent, useCustomEvent } from '../../events';

export type ViewportConfiguration = {
  initialTranslate: { x: number; y: number };
  initialZoom: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type TranslateViewportPayload = { x: number; y: number };

export function dispatchTranslateEvent(position: TranslateViewportPayload) {
  dispatchCustomEvent('translateViewport', position);
}

export function useTranslateViewportEvent(callback: (position: TranslateViewportPayload) => void) {
  useCustomEvent('translateViewport', callback);
}

export function Viewport({
  children,
  onGetViewportConfiguration,
}: {
  children: React.ReactNode;
  onGetViewportConfiguration: () => ViewportConfiguration;
}) {
  const interactionRef = useRef<HTMLDivElement>(null);

  const viewportConfiguration = React.useMemo(onGetViewportConfiguration, [onGetViewportConfiguration]);
  const [zoom, setZoom] = useState(viewportConfiguration.initialZoom);
  const [translate, setTranslate] = useState(viewportConfiguration.initialTranslate);
  const [isInteracting, setInteracting] = useState<boolean | undefined>(false);
  const updateViewport = useCallback(
    (newTranslate: { x: number; y: number }, newZoom: number) => {
      const { minX, minY, maxX, maxY } = viewportConfiguration;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Adjust zoom level
      const adjustedZoom = Math.min(
        Math.max(newZoom, Math.max(viewportWidth / (maxX - minX), viewportHeight / (maxY - minY))),
        4,
      );

      // Adjust translate values
      const adjustedTranslate = {
        x: Math.min(Math.max(newTranslate.x, -(maxX - viewportWidth / adjustedZoom)), -minX),
        y: Math.min(Math.max(newTranslate.y, -(maxY - viewportHeight / adjustedZoom)), -minY),
      };

      setTranslate(adjustedTranslate);
      setZoom(adjustedZoom);
    },
    [viewportConfiguration],
  );

  useEffect(() => {
    updateViewport(viewportConfiguration.initialTranslate, viewportConfiguration.initialZoom);
  }, []);

  useGesture(
    {
      onPinch({ origin, delta, pinching }) {
        setInteracting(pinching);
        const newZoom = zoom + delta[0];
        const rect = interactionRef.current?.getBoundingClientRect();
        const offsetX = origin[0] - (rect?.left ?? 0);
        const offsetY = origin[1] - (rect?.top ?? 0);
        updateViewport(
          {
            x: translate.x - (offsetX / zoom - offsetX / newZoom),
            y: translate.y - (offsetY / zoom - offsetY / newZoom),
          },
          newZoom,
        );
      },
      onWheel({ event, delta: [x, y], wheeling }) {
        event.preventDefault();
        setInteracting(wheeling);
        updateViewport(
          {
            x: translate.x - x / zoom,
            y: translate.y - y / zoom,
          },
          zoom,
        );
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

    updateViewport({ x: newTranslateX / zoom, y: newTranslateY / zoom }, zoom);
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

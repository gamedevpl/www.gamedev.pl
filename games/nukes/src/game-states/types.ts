export type GameStateProps = {
  setGameState: (gameState: GameState, params?: Record<string, string>) => void;
};

export type GameStateComponent = React.FunctionComponent<GameStateProps>;

export type GameState = {
  Component: GameStateComponent;
  path: string;
};

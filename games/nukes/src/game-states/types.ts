export type GameStateProps = {
  setGameState: (gameState: GameState, params?: unknown) => void;
};

export type GameStateComponent = React.FunctionComponent<GameStateProps>;

export type GameState = {
  Component: GameStateComponent;
  path: string;
};

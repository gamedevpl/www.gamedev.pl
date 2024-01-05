export type GameStateProps = {
  setGameState: (gameState: GameState) => void;
};

export type GameStateComponent = React.FunctionComponent<GameStateProps>;

export type GameState = {
  Component: GameStateComponent;
  path: string;
};

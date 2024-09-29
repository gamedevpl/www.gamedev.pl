export const GameStateIntro = ({ onNext }: { onNext: () => void }) => {
  return (
    <div>
      <h1>Welcome to MasterPlan</h1>
      <p>This is the intro state of the application. Click to start the adventure!</p>
      <button
        onClick={() => {
          onNext();
        }}
      >
        Start
      </button>
    </div>
  );
};

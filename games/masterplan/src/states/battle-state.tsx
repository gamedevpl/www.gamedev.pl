const BattleState = ({ onEnd }: { onEnd: () => void }) => {
  return (
    <div>
      <h1>Battle in Progress</h1>
      <p>Engage in the battle and lead your units to victory.</p>
      <button
        onClick={() => {
          onEnd();
        }}
      >
        End Battle
      </button>
    </div>
  );
};

export default BattleState;

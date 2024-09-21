const BattleInitState = ({ onNext }: { onNext: () => void }) => {
  return (
    <div>
      <h1>Prepare for Battle</h1>
      <p>Get ready to enter the battle. Set up your strategy and units.</p>
      <button
        onClick={() => {
          onNext();
        }}
      >
        Enter Battle
      </button>
    </div>
  );
};

export default BattleInitState;

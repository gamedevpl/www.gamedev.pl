import React from 'react';

interface ContextMenuProps {
  unit: {
    id: number;
    type: string;
    command: string;
    sizeCol: number;
    sizeRow: number;
  };
  position: { x: number; y: number };
  onModify: (
    unitId: number,
    changes: Partial<{ type: string; command: string; sizeCol: number; sizeRow: number }>,
  ) => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ unit, position, onModify }) => {
  const handleTypeChange = (newType: string) => {
    onModify(unit.id, { type: newType });
  };

  const handleCommandChange = (newCommand: string) => {
    onModify(unit.id, { command: newCommand });
  };

  const handleFormationChange = (newSizeCol: number, newSizeRow: number) => {
    onModify(unit.id, { sizeCol: newSizeCol, sizeRow: newSizeRow });
  };

  const menuStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${position.x}px`,
    top: `${position.y}px`,
    backgroundColor: 'white',
    border: '1px solid black',
    padding: '10px',
    borderRadius: '5px',
    zIndex: 1000,
    color: 'black', // Changed text color to black
  };

  const buttonStyle: React.CSSProperties = {
    margin: '2px',
    padding: '5px 10px',
    cursor: 'pointer',
  };

  const selectedButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: 'lightblue',
  };

  return (
    <div style={menuStyle}>
      <h3>Modify Unit</h3>
      <div>
        <h4>Type:</h4>
        {['wait-advance', 'advance', 'advance-wait', 'flank-left', 'flank-right'].map((type) => (
          <button
            key={type}
            onClick={() => handleTypeChange(type)}
            style={unit.type === type ? selectedButtonStyle : buttonStyle}
          >
            {type}
          </button>
        ))}
      </div>
      <div>
        <h4>Command:</h4>
        {['archer', 'warrior', 'tank', 'artillery'].map((command) => (
          <button
            key={command}
            onClick={() => handleCommandChange(command)}
            style={unit.command === command ? selectedButtonStyle : buttonStyle}
          >
            {command}
          </button>
        ))}
      </div>
      <div>
        <h4>Formation:</h4>
        {[
          { sizeCol: 1, sizeRow: 4 },
          { sizeCol: 2, sizeRow: 2 },
          { sizeCol: 4, sizeRow: 1 },
        ].map(({ sizeCol, sizeRow }) => (
          <button
            key={`${sizeCol}x${sizeRow}`}
            onClick={() => handleFormationChange(sizeCol, sizeRow)}
            style={{
              ...(unit.sizeCol === sizeCol && unit.sizeRow === sizeRow ? selectedButtonStyle : buttonStyle),
              width: '40px',
              height: '40px',
            }}
          >
            {`${sizeCol}x${sizeRow}`}
          </button>
        ))}
      </div>
    </div>
  );
};

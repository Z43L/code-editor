import React, { useState, useEffect } from 'react';

interface Props {
  title: string;
  count?: number;
}

const TestComponent: React.FC<Props> = ({ title, count = 0 }) => {
  const [value, setValue] = useState<number>(count);
  const [isVisible, setIsVisible] = useState<boolean>(true);
  
  useEffect(() => {
    console.log("Component mounted with title:", title);
  }, [title]);

  const handleIncrement = (): void => {
    setValue(prev => prev + 1);
  };

  const handleToggle = (): void => {
    setIsVisible(!isVisible);
  };

  return (
    <div className="container">
      <h1>{title}</h1>
      {isVisible && (
        <div>
          <p>Current value: {value}</p>
          <button onClick={handleIncrement} type="button">
            Increment
          </button>
          <button onClick={handleToggle} type="button">
            Toggle Visibility
          </button>
        </div>
      )}
    </div>
  );
};

export default TestComponent;
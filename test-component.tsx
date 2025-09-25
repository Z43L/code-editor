import React, { useState, useEffect } from 'react';

interface Props {
  title: string;
  count?: number;
}

const TestComponent: React.FC<Props> = ({ title, count = 0 }) => {
  const [value, setValue] = useState<number>(count);
  const [isVisible, setIsVisible] = useState<boolean>(true);

  useEffect(() => {
    console.log('Component mounted');
    return () => {
      console.log('Component unmounted');
    };
  }, []);

  const handleClick = async (): Promise<void> => {
    try {
      setValue(prev => prev + 1);
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('Value updated:', value);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="container">
      <h1>{title}</h1>
      <p>Current value: {value}</p>
      <button onClick={handleClick}>
        Increment
      </button>
      <button onClick={() => setIsVisible(false)}>
        Hide Component
      </button>
    </div>
  );
};

export default TestComponent;
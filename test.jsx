import React, { useState, useEffect } from 'react';

const TestComponent = () => {
  const [count, setCount] = useState(0);
  const [name, setName] = useState("Hello World");
  
  useEffect(() => {
    console.log("Component mounted");
  }, []);

  const handleClick = () => {
    setCount(count + 1);
  };

  return (
    <div className="container">
      <h1>{name}</h1>
      <p>Count: {count}</p>
      <button onClick={handleClick}>
        Increment
      </button>
      {count > 5 && (
        <div className="warning">
          Count is getting high!
        </div>
      )}
    </div>
  );
};

export default TestComponent;
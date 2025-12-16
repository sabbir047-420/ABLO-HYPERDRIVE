import React from 'react';
import { GameCanvas } from './components/GameCanvas';

function App() {
  return (
    <div className="w-full h-full min-h-screen bg-slate-950 text-slate-100 selection:bg-cyan-500/30">
      <GameCanvas />
    </div>
  );
}

export default App;
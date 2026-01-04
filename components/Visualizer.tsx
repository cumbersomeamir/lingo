
import React from 'react';

interface VisualizerProps {
  isActive: boolean;
  isSpeaking: boolean;
}

export const Visualizer: React.FC<VisualizerProps> = ({ isActive, isSpeaking }) => {
  return (
    <div className="flex items-center justify-center space-x-1 h-12">
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          className={`w-1.5 bg-indigo-500 rounded-full transition-all duration-200 ${
            isActive && isSpeaking ? 'wave-animation' : 'h-2'
          }`}
          style={{
            animationDelay: `${i * 0.1}s`,
            height: isActive && isSpeaking ? 'auto' : '8px'
          }}
        />
      ))}
    </div>
  );
};

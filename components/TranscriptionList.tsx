
import React, { useEffect, useRef } from 'react';
import { TranscriptionEntry } from '../types';

interface TranscriptionListProps {
  entries: TranscriptionEntry[];
}

export const TranscriptionList: React.FC<TranscriptionListProps> = ({ entries }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white/50 backdrop-blur-sm rounded-xl border border-slate-200 min-h-[300px] max-h-[500px]">
      {entries.length === 0 && (
        <div className="h-full flex flex-col items-center justify-center text-slate-400 italic">
          <p>The transcription will appear here once you start speaking...</p>
        </div>
      )}
      {entries.map((entry) => (
        <div
          key={entry.id}
          className={`flex flex-col ${entry.speaker === 'user' ? 'items-end' : 'items-start'}`}
        >
          <div
            className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
              entry.speaker === 'user'
                ? 'bg-indigo-600 text-white rounded-tr-none'
                : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'
            }`}
          >
            {entry.text}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider font-semibold">
            {entry.speaker === 'user' ? 'You' : 'LingoLive AI'}
          </span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
};

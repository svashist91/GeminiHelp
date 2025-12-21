
import React from 'react';

interface VoiceOverlayProps {
  isActive: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  onClose: () => void;
}

const VoiceOverlay: React.FC<VoiceOverlayProps> = ({ isActive, isSpeaking, isListening, onClose }) => {
  if (!isActive) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-300">
      <button 
        onClick={onClose}
        className="absolute top-8 right-8 text-slate-400 hover:text-white transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      <div className="relative flex items-center justify-center">
        {/* Animated Rings */}
        <div className={`absolute w-64 h-64 rounded-full border-2 border-indigo-500/20 ${isSpeaking ? 'animate-ping' : ''}`}></div>
        <div className={`absolute w-48 h-48 rounded-full border-2 border-indigo-500/40 ${isListening ? 'animate-pulse' : ''}`}></div>
        
        {/* Avatar */}
        <div className={`relative w-32 h-32 rounded-3xl bg-gradient-to-br from-indigo-600 to-indigo-800 flex items-center justify-center shadow-2xl z-10 ${isSpeaking ? 'scale-110 shadow-indigo-500/50' : 'scale-100'} transition-transform duration-300`}>
          <span className="text-5xl font-bold text-white serif italic">D</span>
        </div>
      </div>

      <div className="mt-12 text-center">
        <h2 className="text-2xl font-bold text-white serif mb-2 italic">
          {isSpeaking ? 'Drona is speaking...' : isListening ? 'Listening to you...' : 'Connection established'}
        </h2>
        <p className="text-slate-400 font-medium tracking-widest uppercase text-xs">
          Real-time Mentorship Active
        </p>
      </div>

      <div className="mt-16 flex gap-2">
        {[...Array(5)].map((_, i) => (
          <div 
            key={i} 
            className={`w-1 bg-indigo-500 rounded-full transition-all duration-200 ${
              isSpeaking || isListening ? 'h-8' : 'h-2'
            }`}
            style={{ 
              animationDelay: `${i * 0.1}s`,
              animationName: isSpeaking || isListening ? 'wave' : 'none',
              animationIterationCount: 'infinite',
              animationDuration: '0.8s'
            }}
          ></div>
        ))}
      </div>

      <style>{`
        @keyframes wave {
          0%, 100% { height: 10px; }
          50% { height: 40px; }
        }
      `}</style>
    </div>
  );
};

export default VoiceOverlay;

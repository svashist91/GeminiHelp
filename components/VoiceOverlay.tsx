
import React from 'react';

interface VoiceOverlayProps {
  isActive: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  onClose: () => void;
  status: "idle" | "requesting_permissions" | "connecting" | "active" | "reconnecting" | "error";
  error?: string;
  onRetry?: () => void;
}

const VoiceOverlay: React.FC<VoiceOverlayProps> = ({ 
  isActive, 
  isSpeaking, 
  isListening, 
  onClose,
  status,
  error,
  onRetry
}) => {
  if (!isActive) return null;

  // Simple connecting state for non-active statuses
  if (status !== "active") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-300">
        <button 
          onClick={onClose}
          className="absolute top-8 right-8 text-slate-400 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <div className="flex flex-col items-center justify-center gap-6">
          <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center shadow-2xl">
            <span className="text-4xl font-bold text-white serif italic">D</span>
          </div>
          <div className="text-center">
            <p className="text-lg font-medium text-white">Connecting...</p>
            {status === "error" && error && (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-red-400">{error}</p>
                {onRetry && (
                  <button
                    onClick={onRetry}
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full font-semibold text-sm transition-colors"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Active state - main interaction UI
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-300">
      <button 
        onClick={onClose}
        className="absolute top-8 right-8 text-slate-400 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      <div className="relative flex flex-col items-center justify-center gap-12">
        
        {/* Avatar Area with Output Rings */}
        <div className="relative flex items-center justify-center">
          {/* Outer Speaking Ring */}
          <div className={`absolute w-72 h-72 rounded-full border-2 border-indigo-500/30 transition-all duration-300 ${isSpeaking ? 'scale-110 opacity-100 animate-pulse' : 'scale-90 opacity-0'}`}></div>
          {/* Inner Speaking Ring */}
          <div className={`absolute w-60 h-60 rounded-full border border-indigo-500/50 transition-all duration-300 ${isSpeaking ? 'scale-105 opacity-100' : 'scale-90 opacity-0'}`}></div>

          {/* Main Avatar Circle */}
          <div className={`relative w-40 h-40 rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center shadow-2xl z-20 transition-transform duration-500 ${isSpeaking ? 'scale-105 shadow-indigo-500/40' : 'scale-100'}`}>
            <span className="text-6xl font-bold text-white serif italic">D</span>
            
            {/* Small Mic Icon Indicator (Shows when you are speaking) */}
            <div className={`absolute -bottom-3 -right-3 bg-slate-900 border-4 border-slate-950 rounded-full p-3 transition-transform duration-300 ${isListening ? 'scale-100' : 'scale-0'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              </svg>
            </div>
          </div>
        </div>

        {/* Dynamic Text Feedback */}
        <div className="text-center space-y-2 h-16">
          {isSpeaking && (
            <p className="text-lg font-medium text-white animate-in slide-in-from-bottom-2 fade-in">
              " I'm explaining the next step... "
            </p>
          )}
          {!isSpeaking && isListening && (
            <p className="text-lg font-medium text-slate-400 animate-in slide-in-from-bottom-2 fade-in">
              " Listening to you... "
            </p>
          )}
          {!isSpeaking && !isListening && (
            <p className="text-sm font-medium text-slate-500 italic">
              Watching your screen. Ask me anything.
            </p>
          )}
        </div>

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

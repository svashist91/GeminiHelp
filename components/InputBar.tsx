
import React, { useState, useRef, useEffect } from 'react';

interface InputBarProps {
  onSend: (message: string) => void;
  onVoiceClick: () => void;
  isVoiceActive: boolean;
  disabled: boolean;
}

const InputBar: React.FC<InputBarProps> = ({ onSend, onVoiceClick, isVoiceActive, disabled }) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (input.trim() && !disabled) {
      onSend(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  return (
    <div className="border-t border-slate-800 bg-slate-900/80 backdrop-blur-md p-4 pb-8">
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex items-end gap-3">
        {/* Interaction Mode Button (Screen + Voice) */}
        <button
          type="button"
          onClick={onVoiceClick}
          className={`p-3 rounded-xl transition-all shadow-lg flex-shrink-0 ${
            isVoiceActive 
              ? 'bg-amber-500 text-white animate-pulse' 
              : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
          title={isVoiceActive ? "Stop Interaction Mode" : "Start Interaction Mode (Screen + Voice)"}
        >
          {isVoiceActive ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
               <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
               <circle cx="12" cy="12" r="3"></circle>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
          )}
        </button>

        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Drona anything..."
            disabled={disabled}
            className="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none disabled:opacity-50"
          />
        </div>
        
        <button
          type="submit"
          disabled={!input.trim() || disabled}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white p-3 rounded-xl transition-colors shadow-lg flex-shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </form>
      <p className="text-[10px] text-slate-500 text-center mt-3 uppercase tracking-widest font-medium">
        Driven by Intelligence • Built for Wisdom
      </p>
    </div>
  );
};

export default InputBar;

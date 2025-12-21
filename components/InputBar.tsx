
import React, { useState, useRef, useEffect } from 'react';

interface InputBarProps {
  onSend: (message: string) => void;
  disabled: boolean;
}

const InputBar: React.FC<InputBarProps> = ({ onSend, disabled }) => {
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
          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white p-3 rounded-xl transition-colors shadow-lg"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

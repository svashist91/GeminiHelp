
import React, { useState, useRef, useEffect } from 'react';

interface FileWithMeta {
  file: File;
  previewUrl?: string; // object URL for images
}

interface InputBarProps {
  onSend: (message: string, attachments?: FileWithMeta[]) => void;
  onVoiceClick: () => void;
  isVoiceActive: boolean;
  disabled: boolean;
}

const InputBar: React.FC<InputBarProps> = ({ onSend, onVoiceClick, isVoiceActive, disabled }) => {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<FileWithMeta[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());

  const addToAttachments = (file: File) => {
    setAttachments(prev => {
      const existing = new Set(prev.map(f => `${f.file.name}-${f.file.size}-${f.file.lastModified}`));
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      if (existing.has(key)) {
        return prev; // Already exists, don't add duplicate
      }
      
      // Create preview URL for images
      const previewUrl = file.type.startsWith('image/') 
        ? URL.createObjectURL(file) 
        : undefined;
      
      if (previewUrl) {
        previewUrlsRef.current.add(previewUrl);
      }
      
      return [...prev, { file, previewUrl }];
    });
  };

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    files.forEach(file => addToAttachments(file));

    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    let filesAdded = false;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          addToAttachments(file);
          filesAdded = true;
        }
      }
    }

    // Prevent default paste behavior if files were added
    if (filesAdded) {
      e.preventDefault();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      files.forEach(file => addToAttachments(file));
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => {
      const removed = prev[index];
      // Revoke object URL if it exists
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
        previewUrlsRef.current.delete(removed.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((input.trim() || attachments.length > 0) && !disabled) {
      const filesWithMeta = attachments.length > 0 ? attachments : undefined;
      onSend(input.trim(), filesWithMeta);
      
      // Clean up object URLs after sending
      attachments.forEach(att => {
        if (att.previewUrl) {
          URL.revokeObjectURL(att.previewUrl);
          previewUrlsRef.current.delete(att.previewUrl);
        }
      });
      
      setInput('');
      setAttachments([]);
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

  // Cleanup object URLs on unmount (safety net)
  useEffect(() => {
    return () => {
      // On unmount, revoke any remaining object URLs
      previewUrlsRef.current.forEach(url => {
        URL.revokeObjectURL(url);
      });
      previewUrlsRef.current.clear();
    };
  }, []);

  return (
    <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 backdrop-blur-md p-4 pb-8">
      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onVoiceClick}
            className={`h-11 w-11 rounded-xl transition-all shadow-lg flex-shrink-0 flex items-center justify-center ${
              isVoiceActive 
                ? 'bg-red-500 text-white animate-pulse' 
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
            title={isVoiceActive ? "Stop Interaction Mode" : "Start Interaction Mode (Voice + Vision)"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
          </button>

          <div className="relative flex-1">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFilesSelected}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors disabled:opacity-50 z-10"
              title="Attach file"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
              </svg>
            </button>

            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              placeholder="Ask Drona anything..."
              disabled={disabled}
              className="w-full min-h-[44px] bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl pl-12 pr-4 py-2.5 leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none disabled:opacity-50"
            />
          </div>
          
          <button
            type="submit"
            disabled={(!input.trim() && attachments.length === 0) || disabled}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white h-11 w-11 rounded-xl transition-colors shadow-lg flex-shrink-0 flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {attachments.map((att, index) => (
              <div
                key={`${att.file.name}-${att.file.size}-${index}`}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm"
              >
                <span className="text-slate-600 dark:text-slate-400">📎</span>
                <span className="text-slate-700 dark:text-slate-300">{att.file.name}</span>
                <span className="text-slate-500 dark:text-slate-500">•</span>
                <span className="text-slate-500 dark:text-slate-500 text-xs">{formatFileSize(att.file.size)}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(index)}
                  className="ml-1 text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  title="Remove file"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </form>
      <p className="text-[10px] text-slate-500 dark:text-slate-500 text-center mt-3 uppercase tracking-widest font-medium">
        Driven by Intelligence • Built for Wisdom
      </p>
    </div>
  );
};

export default InputBar;

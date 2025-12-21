
import React from 'react';
import { ChatSession } from '../types';

interface SidebarProps {
  sessions: ChatSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string, e: React.MouseEvent) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  sessions, 
  activeSessionId, 
  onSelectSession, 
  onNewChat, 
  onDeleteSession,
  isOpen,
  onToggle
}) => {
  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden backdrop-blur-sm"
          onClick={onToggle}
        />
      )}

      {/* Sidebar Container */}
      <aside className={`fixed md:relative inset-y-0 left-0 z-30 w-72 bg-slate-900 border-r border-slate-800 flex flex-col transition-transform duration-300 transform ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-4 flex flex-col h-full">
          {/* New Chat Button */}
          <button
            onClick={() => {
              onNewChat();
              if (window.innerWidth < 768) onToggle();
            }}
            className="flex items-center gap-3 w-full p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all shadow-lg shadow-indigo-500/10 font-medium mb-6"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            New Chat
          </button>

          {/* History Label */}
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold mb-3 px-2">
            Recent Mentorships
          </div>

          {/* Sessions List */}
          <div className="flex-1 overflow-y-auto space-y-1 pr-2 -mr-2">
            {sessions.length === 0 ? (
              <div className="text-center py-8 px-4">
                <p className="text-slate-600 text-sm italic">No history yet</p>
              </div>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => {
                    onSelectSession(s.id);
                    if (window.innerWidth < 768) onToggle();
                  }}
                  className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                    activeSessionId === s.id 
                      ? 'bg-slate-800 text-white border border-slate-700' 
                      : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 opacity-50">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span className="truncate text-sm font-medium">
                      {s.title || 'Untitled Session'}
                    </span>
                  </div>
                  
                  <button
                    onClick={(e) => onDeleteSession(s.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all rounded"
                    title="Delete session"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer Info */}
          <div className="pt-4 border-t border-slate-800 mt-4 px-2">
             <div className="flex items-center gap-3 opacity-60">
               <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Drona v1.0.2</span>
             </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;


import React, { useState } from 'react';
import { ChatSession } from '../types';

type Project = {
  id: string;
  name: string;
  createdAt: string;
};

interface SidebarProps {
  userId?: string | null;
  projects: Project[];
  onCreateProject: (name: string) => void;
  sessions: ChatSession[];
  activeSessionId: string;
  activeProjectId: string | null;
  onSelectProject: (id: string) => void;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteProject: (projectId: string) => void | Promise<void>;
  onRequestDeleteSession: (sessionId: string) => void | Promise<void>;
  isOpen: boolean;
  onToggle: () => void;
  onOpenPricing: () => void;
  onOpenSearch: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  userId,
  projects,
  onCreateProject,
  sessions, 
  activeSessionId,
  activeProjectId,
  onSelectProject,
  onSelectSession, 
  onNewChat, 
  onDeleteProject,
  onRequestDeleteSession,
  isOpen,
  onToggle,
  onOpenPricing,
  onOpenSearch
}) => {
  const [projectName, setProjectName] = useState('');
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmType, setConfirmType] = useState<"project" | "session" | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; label: string } | null>(null);

  return (
    <>
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden backdrop-blur-sm"
          onClick={onToggle}
        />
      )}

      {isProjectModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsProjectModalOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Create project
              </h3>
              <button
                onClick={() => setIsProjectModalOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                title="Close"
              >
                ✕
              </button>
            </div>

            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
              Project name
            </label>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g., AWS Migration, Drona v2, Interview Prep..."
              className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onCreateProject(projectName);
                  setIsProjectModalOpen(false);
                }
              }}
            />

            <div className="flex items-center justify-end gap-3 mt-5">
              <button
                onClick={() => setIsProjectModalOpen(false)}
                className="px-4 py-2 rounded-xl font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onCreateProject(projectName);
                  setIsProjectModalOpen(false);
                }}
                className="px-4 py-2 rounded-xl font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
                disabled={!projectName.trim()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmOpen && confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setConfirmOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
              Confirm deletion
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {confirmType === "project"
                ? `Delete project "${confirmTarget.label}"? This will delete all chats and messages in this project.`
                : `Delete chat "${confirmTarget.label}"? This will delete all messages in the chat.`}
            </p>
            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const id = confirmTarget.id;
                  const type = confirmType;
                  setConfirmOpen(false);
                  setConfirmType(null);
                  setConfirmTarget(null);
                  if (type === "project") await onDeleteProject(id);
                  if (type === "session") await onRequestDeleteSession(id);
                }}
                className="px-4 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <aside className={`fixed md:relative inset-y-0 left-0 z-30 w-72 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-300 transform ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-4 flex flex-col h-full">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={onOpenSearch}
              className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-sm"
              title="Search chats"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </button>
            <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500 font-bold">Drona</span>
          </div>

          <div className="flex items-center justify-between mt-2 mb-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500 font-bold px-2">
              Projects
            </div>
            <button
              onClick={() => {
                setProjectName("");
                setIsProjectModalOpen(true);
              }}
              className="px-2 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              title="New project"
            >
              + New
            </button>
          </div>

          <div className="mb-4 space-y-1 pr-2 -mr-2 max-h-40 overflow-y-auto">
            {projects.length === 0 ? (
              <div className="text-center py-4 px-4">
                <p className="text-slate-400 text-sm italic">No projects yet</p>
              </div>
            ) : (
              projects.map((p) => (
                <div
                  key={p.id}
                  onClick={() => {
                    onSelectProject(p.id);
                    if (window.innerWidth < 768) onToggle();
                  }}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                    activeProjectId === p.id
                      ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 flex-shrink-0" />
                    <span className="truncate text-sm font-medium">{p.name}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmType("project");
                      setConfirmTarget({ id: p.id, label: p.name });
                      setConfirmOpen(true);
                    }}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Delete project"
                  >
                    🗑️
                  </button>
                </div>
              ))
            )}
          </div>

          {!activeProjectId ? (
            <div className="mt-3 mb-4 px-3 py-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-sm">
              Select or create a project to view chats.
            </div>
          ) : (
            <>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-500 font-bold px-2 mt-3 mb-2">
                Chats
              </div>

              <div className="flex-1 overflow-y-auto space-y-1 pr-2 -mr-2">
                {sessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => {
                    onSelectSession(s.id);
                    if (window.innerWidth < 768) onToggle();
                  }}
                  className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                    activeSessionId === s.id 
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 shadow-sm' 
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'
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
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmType("session");
                      setConfirmTarget({
                        id: s.id,
                        label: s.title || 'Untitled Session'
                      });
                      setConfirmOpen(true);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Delete chat"
                  >
                    🗑️
                  </button>
                </div>
                ))}
              </div>
            </>
          )}

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 mt-4 px-2">
             <div className="flex items-center gap-3 opacity-60">
               <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
               <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Drona v1.1.0</span>
             </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={onOpenPricing}
            className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold shadow-lg hover:from-indigo-500 hover:to-purple-500 transition-all"
          >
            Upgrade Plan
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;

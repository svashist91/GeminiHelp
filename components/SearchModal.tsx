import React, { useEffect, useRef, useState } from 'react';
import { searchChats, SearchResultGroup } from '../services/searchService';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectHit: (sessionId: string, messageId: string) => void;
  getToken: () => Promise<string | null>;
}

type SearchStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose, onSelectHit, getToken }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [results, setResults] = useState<SearchResultGroup[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
      if (e.key === 'Enter') {
        const firstGroup = results[0];
        const firstHit = firstGroup?.hits?.[0];
        if (firstGroup && firstHit) {
          onSelectHit(firstGroup.sessionId, firstHit.messageId);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, onSelectHit, results]);

  useEffect(() => {
    if (!isOpen) return;

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setStatus('idle');
      setError(null);
      return;
    }

    debounceRef.current = window.setTimeout(async () => {
      setStatus('loading');
      setError(null);
      try {
        const data = await searchChats(getToken, trimmed, 20);
        const res = data.results || [];
        setResults(res);
        setStatus(res.length > 0 ? 'success' : 'empty');
      } catch (err: any) {
        setResults([]);
        setStatus('error');
        setError(err?.message || 'Search failed');
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [query, getToken, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-xl md:max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 mx-4">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
          aria-label="Close search modal"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Search chats</h2>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </span>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search your chats…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-12 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-3 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="bg-slate-50/60 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4 max-h-80 overflow-y-auto space-y-3">
          {status === 'idle' && (
            <div className="text-sm text-slate-500 dark:text-slate-500 italic">Type at least 2 characters to search</div>
          )}
          {status === 'loading' && (
            <div className="text-sm text-slate-500 dark:text-slate-400 italic">Searching…</div>
          )}
          {status === 'empty' && (
            <div className="text-sm text-slate-500 dark:text-slate-500 italic">No results</div>
          )}
          {status === 'error' && (
            <div className="text-sm text-red-500 dark:text-red-400">{error || 'Search failed'}</div>
          )}
          {status === 'success' && results.map(group => (
            <div key={group.sessionId} className="space-y-1">
              <div className="text-[11px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 font-semibold truncate">
                {group.sessionTitle || 'Untitled Session'}
              </div>
              {group.hits.slice(0, 3).map(hit => (
                <button
                  key={hit.messageId}
                  className="w-full text-left px-3 py-2 rounded-lg bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  onClick={() => onSelectHit(group.sessionId, hit.messageId)}
                >
                  <div
                    className="truncate"
                    dangerouslySetInnerHTML={{ __html: hit.snippet || '' }}
                  />
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SearchModal;


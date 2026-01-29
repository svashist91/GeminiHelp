import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';

import { getProjectContext } from '../../../services/contextApi';
import { PlanContext } from '../../../shared/contextSchema';
import PlanWorkspace from './PlanWorkspace';

type PlanPanelProps = {
  projectId?: string | null;
};

const PlanPanel: React.FC<PlanPanelProps> = ({ projectId }) => {
  const { getToken } = useAuth();
  const [context, setContext] = useState<PlanContext | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContext = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    setError(null);

    const res = await getProjectContext({ projectId, getToken });
    if (res.ok) {
      setContext(res.context);
    } else {
      setContext(null);
      setError('message' in res && res.message ? res.message : 'Failed to load plan.');
    }
    setIsLoading(false);
  }, [projectId, getToken]);

  useEffect(() => {
    if (!projectId) {
      setContext(null);
      setError(null);
      return;
    }
    fetchContext();
  }, [projectId, fetchContext]);

  if (!projectId) {
    return (
      <div className="w-full h-full min-h-0 flex items-center justify-center text-slate-500 dark:text-slate-400">
        Select a project to view the plan.
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-0 flex flex-col">
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-800">
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Plan
        </div>
        <button
          onClick={fetchContext}
          disabled={isLoading}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="flex-1 min-h-0 flex">
        {error && (
          <div className="p-4 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}
        {!error && isLoading && !context && (
          <div className="p-4 text-sm text-slate-500 dark:text-slate-400">
            Loading plan...
          </div>
        )}
        {!error && context && (
          <div className="flex-1 min-h-0">
            <PlanWorkspace context={context} />
          </div>
        )}
        {!error && !isLoading && !context && (
          <div className="p-4 text-sm text-slate-500 dark:text-slate-400">
            No plan captured yet.
          </div>
        )}
      </div>
    </div>
  );
};

export default PlanPanel;


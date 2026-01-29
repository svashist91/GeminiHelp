import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { getProjectContext } from '../services/contextApi';
import { PlanContext, StepNode } from '../shared/contextSchema';

type PlanPanelProps = {
  projectId: string;
  onClose?: () => void;
};

const statusClasses: Record<StepNode['status'], string> = {
  todo: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200',
  doing: 'bg-blue-200 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200',
  blocked: 'bg-red-200 text-red-900 dark:bg-red-900/40 dark:text-red-200',
  done: 'bg-green-200 text-green-900 dark:bg-green-900/40 dark:text-green-200'
};

const shouldHideNode = (title: string) =>
  /please clarify|clarifying|questions for you|need more info/i.test(title);

const collectAllIds = (context: PlanContext | null): string[] => {
  if (!context) return [];
  return Object.keys(context.steps || {});
};

const PlanPanel: React.FC<PlanPanelProps> = ({ projectId }) => {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<PlanContext | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const allIds = useMemo(() => collectAllIds(context), [context]);

  const expandAll = useCallback(() => {
    setExpanded(new Set(allIds));
  }, [allIds]);

  const collapseAll = useCallback(() => {
    setExpanded(new Set());
  }, []);

  const toggleNode = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!projectId) {
      setContext(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getProjectContext({ projectId, getToken })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setContext(res.context);
          return;
        }
        setContext(null);
        setError(res.message || 'Failed to load plan');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'Failed to load plan');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, getToken]);

  useEffect(() => {
    if (!context) return;
    setExpanded(new Set(collectAllIds(context)));
  }, [context]);

  const renderNode = (
    stepId: string,
    depth: number,
    path: Set<string>
  ): React.ReactNode => {
    const step = context?.steps?.[stepId];
    if (!step) return null;
    if (shouldHideNode(step.title)) return null;
    if (path.has(stepId)) {
      return (
        <div key={`${stepId}-cycle`} className="text-xs text-slate-500 ml-6">
          (cycle)
        </div>
      );
    }

    const nextPath = new Set(path);
    nextPath.add(stepId);
    const hasChildren = (step.children || []).length > 0;
    const isExpanded = expanded.has(stepId);

    return (
      <div key={stepId} className="space-y-2">
        <div
          className="flex items-center gap-2"
          style={{ marginLeft: depth * 16 }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleNode(stepId)}
              className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? '▾' : '▸'}
            </button>
          ) : (
            <span className="w-5 text-slate-300 dark:text-slate-700">•</span>
          )}
          <span className="text-sm text-slate-900 dark:text-slate-100">
            {step.title}
          </span>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${statusClasses[step.status]}`}
          >
            {step.status}
          </span>
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-2">
            {step.children.map(childId => renderNode(childId, depth + 1, nextPath))}
          </div>
        )}
      </div>
    );
  };

  if (!projectId) {
    return (
      <div className="text-center text-slate-500 dark:text-slate-400">
        Select a project to view the plan.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center text-slate-500 dark:text-slate-400">
        Loading plan…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-500 dark:text-red-400">
        {error}
      </div>
    );
  }

  if (!context || context.root_step_ids.length === 0) {
    return (
      <div className="text-center text-slate-500 dark:text-slate-400">
        No plan captured yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Plan
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={expandAll}
            className="px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            Collapse all
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {context.root_step_ids.map(rootId =>
          renderNode(rootId, 0, new Set())
        )}
      </div>
    </div>
  );
};

export default PlanPanel;


import React, { useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Edge,
  Node,
  NodeProps,
  Position,
  Handle
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';

import { PlanContext, StepNode } from '../../../shared/contextSchema';

type PlanWorkspaceProps = {
  context: PlanContext | null;
};

type PlanNodeData = {
  title: string;
  status: StepNode['status'];
  childCount: number;
};

const NODE_WIDTH = 260;
const NODE_HEIGHT = 80;

const SKIP_TITLE_REGEX =
  /please clarify|clarifying|questions for you|need more info/i;

const statusLabel = (status: StepNode['status']) => {
  switch (status) {
    case 'todo':
      return 'todo';
    case 'doing':
      return 'doing';
    case 'blocked':
      return 'blocked';
    case 'done':
      return 'done';
    default:
      return 'todo';
  }
};

const statusPillClass = (status: StepNode['status']) => {
  switch (status) {
    case 'doing':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300';
    case 'blocked':
      return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300';
    case 'done':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300';
    case 'todo':
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-200';
  }
};

const PlanNode: React.FC<NodeProps<PlanNodeData>> = ({ data, selected }) => {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 shadow-sm bg-white dark:bg-slate-900 transition-colors ${
        selected
          ? 'border-indigo-500 ring-2 ring-indigo-500/30'
          : 'border-slate-200 dark:border-slate-800'
      }`}
      style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{
          opacity: 0,
          width: 10,
          height: 10,
          border: 'none',
          background: 'transparent'
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          opacity: 0,
          width: 10,
          height: 10,
          border: 'none',
          background: 'transparent'
        }}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2">
          {data.title || 'Untitled step'}
        </div>
        <span
          className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${statusPillClass(
            data.status
          )}`}
        >
          {statusLabel(data.status)}
        </span>
      </div>
      <div className="mt-2 text-xs text-slate-400 dark:text-slate-500">
        {data.childCount} sub-steps
      </div>
    </div>
  );
};

const buildPlanGraph = (context: PlanContext) => {
  const nodes: Node<PlanNodeData>[] = [];
  const edges: Edge[] = [];
  const visited = new Set<string>();
  const nodeIds = new Set<string>();
  const edgeCandidates: Array<{ parentId: string; childId: string }> = [];

  const getChildIds = (step: StepNode) => {
    const anyStep = step as StepNode & {
      children_ids?: string[];
      childrenIds?: string[];
    };
    return anyStep.children_ids ?? anyStep.children ?? anyStep.childrenIds ?? [];
  };

  const traverse = (stepId: string) => {
    if (visited.has(stepId)) return;
    visited.add(stepId);

    const step = context.steps[stepId];
    if (!step) return;

    if (SKIP_TITLE_REGEX.test(step.title || '')) {
      return;
    }

    nodes.push({
      id: step.id,
      type: 'planNode',
      data: {
        title: step.title || 'Untitled step',
        status: step.status,
        childCount: getChildIds(step).length
      },
      position: { x: 0, y: 0 },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top
    });
    nodeIds.add(step.id);

    const childIds = getChildIds(step);
    for (const childId of childIds) {
      const child = context.steps[childId];
      if (!child) continue;
      if (SKIP_TITLE_REGEX.test(child.title || '')) {
        continue;
      }
      edgeCandidates.push({ parentId: step.id, childId });
      traverse(childId);
    }
  };

  for (const rootId of context.root_step_ids || []) {
    traverse(rootId);
  }

  for (const { parentId, childId } of edgeCandidates) {
    if (!nodeIds.has(parentId) || !nodeIds.has(childId)) continue;
    edges.push({
      id: `e:${parentId}->${childId}`,
      source: parentId,
      target: childId,
      type: 'smoothstep'
    });
  }

  return { nodes, edges };
};

const applyDagreLayout = (nodes: Node[], edges: Edge[]) => {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'TB',
    nodesep: 60,
    ranksep: 90
  });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const layouted = nodes.map((node) => {
    const layoutNode = g.node(node.id);
    if (!layoutNode) return node;
    return {
      ...node,
      position: {
        x: layoutNode.x - NODE_WIDTH / 2,
        y: layoutNode.y - NODE_HEIGHT / 2
      }
    };
  });

  return layouted;
};

const PlanWorkspace: React.FC<PlanWorkspaceProps> = ({ context }) => {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  const { nodes, edges } = useMemo(() => {
    if (!context) return { nodes: [], edges: [] };
    return buildPlanGraph(context);
  }, [context]);

  const layoutedNodes = useMemo(
    () => applyDagreLayout(nodes, edges),
    [nodes, edges]
  );

  const selectedStep = selectedStepId ? context?.steps[selectedStepId] : null;

  if (
    !context ||
    context.root_step_ids.length === 0 ||
    Object.keys(context.steps).length === 0
  ) {
    return (
      <div className="w-full h-full min-h-0 flex items-center justify-center text-slate-500 dark:text-slate-400">
        No plan captured yet.
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-0 flex">
      <div className="flex-1 min-h-0 min-w-0">
        <ReactFlow
          nodes={layoutedNodes}
          edges={edges}
          nodeTypes={{ planNode: PlanNode }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={true}
          fitView
          onNodeClick={(_, node) => setSelectedStepId(node.id)}
          className="w-full h-full relative"
        >
          <Background gap={18} size={1} color="rgba(100, 116, 139, 0.2)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <aside className="w-[360px] shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500 font-semibold mb-3">
          Inspector
        </div>
        {!selectedStep ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Select a step to view details.
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-widest text-slate-400 dark:text-slate-500">
                Title
              </div>
              <div className="text-slate-900 dark:text-white font-semibold">
                {selectedStep.title || 'Untitled step'}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-widest text-slate-400 dark:text-slate-500">
                Status
              </div>
              <div className="text-slate-700 dark:text-slate-200">
                {statusLabel(selectedStep.status)}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-widest text-slate-400 dark:text-slate-500">
                ID
              </div>
              <div className="text-slate-600 dark:text-slate-300 break-all">
                {selectedStep.id}
              </div>
            </div>
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span>Depends on</span>
              <span className="font-semibold">
                {selectedStep.depends_on?.length ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span>Children</span>
              <span className="font-semibold">
                {selectedStep.children?.length ?? 0}
              </span>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
};

export default PlanWorkspace;


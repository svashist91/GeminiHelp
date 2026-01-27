export type StepStatus = "todo" | "doing" | "blocked" | "done";

export type StepNode = {
  id: string;
  title: string;
  status: StepStatus;
  parent: string | null;
  children: string[];
  depends_on: string[];
};

export type PatchActor = {
  type: "user" | "ai";
  id?: string;
};

export type PatchOp =
  | { op: "upsert_step"; step: StepNode }
  | { op: "set_step_status"; id: string; status: StepStatus }
  | { op: "add_root_step"; id: string }
  | { op: "add_child"; parent_id: string; child_id: string }
  | { op: "add_dependency"; id: string; depends_on: string };

export type Patch = {
  patch_id: string;
  actor?: PatchActor;
  ops: PatchOp[];
};

export type PlanContext = {
  schema_version: "plan@1";
  version: number;
  root_step_ids: string[];
  steps: Record<string, StepNode>;
};

export function createEmptyPlanContext(): PlanContext {
  return {
    schema_version: "plan@1",
    version: 1,
    root_step_ids: [],
    steps: {}
  };
}

export function validatePlanContext(input: unknown): PlanContext {
  // TODO: add runtime validation (e.g., with zod) once a schema library is added.
  return input as PlanContext;
}

export function applyPatch(ctx: PlanContext, patch: Patch): PlanContext {
  const next: PlanContext = {
    schema_version: "plan@1",
    version: ctx.version,
    root_step_ids: [...ctx.root_step_ids],
    steps: { ...ctx.steps }
  };

  const ensureStep = (id: string) => {
    if (!next.steps[id]) {
      throw new Error(`Missing step id=${id}`);
    }
  };

  const addUnique = (list: string[], value: string) => {
    if (!list.includes(value)) list.push(value);
  };

  for (const op of patch.ops) {
    switch (op.op) {
      case "upsert_step": {
        const existing = next.steps[op.step.id];
        next.steps[op.step.id] = {
          ...op.step,
          children: [...op.step.children],
          depends_on: [...op.step.depends_on],
          parent: op.step.parent ?? null
        };
        if (existing) {
          // preserve existing relationships when missing in incoming step
          if (op.step.children.length === 0) {
            next.steps[op.step.id].children = [...existing.children];
          }
          if (op.step.depends_on.length === 0) {
            next.steps[op.step.id].depends_on = [...existing.depends_on];
          }
        }
        break;
      }
      case "set_step_status": {
        ensureStep(op.id);
        next.steps[op.id] = { ...next.steps[op.id], status: op.status };
        break;
      }
      case "add_root_step": {
        addUnique(next.root_step_ids, op.id);
        break;
      }
      case "add_child": {
        ensureStep(op.parent_id);
        ensureStep(op.child_id);
        const parent = next.steps[op.parent_id];
        const child = next.steps[op.child_id];
        next.steps[op.parent_id] = {
          ...parent,
          children: parent.children.includes(op.child_id)
            ? parent.children
            : [...parent.children, op.child_id]
        };
        if (child.parent === null) {
          next.steps[op.child_id] = { ...child, parent: op.parent_id };
        }
        break;
      }
      case "add_dependency": {
        ensureStep(op.id);
        ensureStep(op.depends_on);
        const step = next.steps[op.id];
        next.steps[op.id] = {
          ...step,
          depends_on: step.depends_on.includes(op.depends_on)
            ? step.depends_on
            : [...step.depends_on, op.depends_on]
        };
        break;
      }
      default:
        throw new Error(`Unsupported patch op: ${(op as PatchOp).op}`);
    }
  }

  for (const rootId of next.root_step_ids) {
    if (!next.steps[rootId]) {
      throw new Error(`Missing root step id=${rootId}`);
    }
  }

  for (const step of Object.values(next.steps)) {
    for (const childId of step.children) {
      if (!next.steps[childId]) {
        throw new Error(`Missing child step id=${childId} for step id=${step.id}`);
      }
    }
    for (const depId of step.depends_on) {
      if (!next.steps[depId]) {
        throw new Error(`Missing dependency step id=${depId} for step id=${step.id}`);
      }
    }
  }

  next.version = ctx.version + 1;
  return next;
}


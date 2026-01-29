import { Patch, PlanContext, createEmptyPlanContext } from '../../shared/contextSchema';
import { applyProjectContextPatch } from '../../services/contextApi';

const EXECUTION_SECTION_TITLE = 'Build & Execution Steps';
const EXECUTION_SUBSTEPS = [
  'Discovery & Specification',
  'Core AI Integration',
  'Angle Calculation & Logic',
  'UX/UI Implementation',
  'Internal Testing & Refinement',
  'Alpha/Beta Testing'
];

const SECTION_TITLES = [
  'Assumptions',
  'Scope',
  'MVP Feature Set',
  'Architecture',
  'Content Strategy',
  EXECUTION_SECTION_TITLE,
  'Release Blockers',
  'Risks',
  'Next Actions'
];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

function normalizeStepTitle(raw: string): string {
  if (!raw) return '';
  let t = raw.trim();

  t = t.replace(/^\*\*(.+?)\*\*$/s, '$1').trim();
  t = t.replace(/^\*\*/, '').replace(/\*\*$/, '').trim();

  t = t.replace(/:+\s*$/g, '').trim();
  t = t.replace(/\s+/g, ' ').trim();

  return t;
}

function shouldSkipSectionTitle(titleRaw: string): boolean {
  const t = normalizeStepTitle(titleRaw).toLowerCase();

  if (t === 'please clarify the following') return true;
  if (t.includes('critical decision checklist')) return true;
  if (t === 'questions') return true;

  return false;
}

export function isPlanLikeResponse(text: string): boolean {
  if (!text) return false;

  const bulletCount = (text.match(/\n\s*[-•]/g) || []).length;
  const numberedCount = (text.match(/\n\s*\d+\./g) || []).length;

  const signals = [
    /assumptions\s*:/i.test(text),
    /mvp/i.test(text),
    /in scope/i.test(text),
    /out of scope/i.test(text),
    /architecture/i.test(text),
    /execution/i.test(text),
    /next actions/i.test(text),
    /step[-\s]?by[-\s]?step/i.test(text),
    bulletCount >= 4,
    numberedCount >= 2,
  ];

  // 🔍 Debug logging (keep during testing)
  console.log('[PlanWriter] plan detection signals', {
    bulletCount,
    numberedCount,
    hasAssumptions: /assumptions\s*:/i.test(text),
    hasExecution: /execution/i.test(text),
    hasMVP: /mvp/i.test(text),
  });

  return signals.some(Boolean);
}

function isClarificationResponse(text: string): boolean {
  const t = (text || '').toLowerCase();

  const hasClarify = t.includes('please clarify') || t.includes('clarify the following');
  const hasCannot = t.includes('cannot provide') || t.includes("can't provide") || t.includes('cannot give');
  const questionMarks = (text.match(/\?/g) || []).length;

  if ((hasClarify || hasCannot) && questionMarks >= 2) return true;

  if (t.includes('critical decision') && questionMarks >= 1) return true;

  return false;
}

type BuildPatchArgs = {
  assistantText: string;
  userText: string;
  rootId?: string | null;
};

export function buildPlanPatchFromText({
  assistantText,
  userText,
  rootId: existingRootId = null
}: BuildPatchArgs): Patch | null {
  const isPlanLike = isPlanLikeResponse(assistantText);
  console.groupCollapsed('[PlanWriter] buildPlanPatchFromText');
  console.log('isPlanLike', isPlanLike);
  if (!isPlanLike) {
    console.groupEnd();
    return null;
  }

  const ts = Date.now();
  const rootId = existingRootId ?? `step_root_${ts}`;
  const rootTitle = /yoga/i.test(userText) ? 'Build yoga app MVP' : 'Project plan';

  const sections = extractSections(assistantText);
  const normalizedSections = sections
    .map(s => ({ ...s, title: normalizeStepTitle(s.title) }))
    .filter(s => !shouldSkipSectionTitle(s.title));

  const hasImplementation = normalizedSections.some(s =>
    /implementation\s*&\s*development/i.test(s.title) ||
    /^implementation\b/i.test(s.title)
  );

  const finalSections = normalizedSections.filter(s => {
    const isContinued = /\bcontinued\b/i.test(s.title);
    const isImplementation = /implementation\s*&\s*development/i.test(s.title) || /^implementation\b/i.test(s.title);

    if (hasImplementation && isImplementation && isContinued) {
      console.log('[PlanWriter] dropping duplicate continued implementation section:', s.title);
      return false;
    }
    return true;
  });

  console.log('[PlanWriter] extracted section titles:', finalSections.map(s => s.title));
  const sectionTitles = finalSections.map(section => section.title);
  console.log('section titles', sectionTitles);

  const patchId = `patch_${Date.now()}`;
  const ops: Patch['ops'] = [];

  if (!existingRootId) {
    ops.push({
      op: 'upsert_step',
      step: {
        id: rootId,
        title: rootTitle,
        status: 'doing',
        parent: null,
        children: [],
        depends_on: []
      }
    });
    ops.push({ op: 'add_root_step', id: rootId });
  }

  const sectionIdByTitle = new Map<string, string>();

  const skipTitles = new Set([
    'please clarify the following',
    'critical decision checklist',
    'questions',
  ]);

  finalSections.forEach((section, idx) => {
    const cleanTitle = normalizeStepTitle(section.title);
    if (shouldSkipSectionTitle(cleanTitle)) {
      console.log('[PlanWriter] skipping section title', cleanTitle);
      return;
    }
    const normalized = cleanTitle.trim().toLowerCase();
    if (skipTitles.has(normalized)) return;
    const sectionId = `step_${slugify(cleanTitle)}_${idx + 1}_${ts}`;
    sectionIdByTitle.set(cleanTitle.toLowerCase(), sectionId);

    ops.push({
      op: 'upsert_step',
      step: {
        id: sectionId,
        title: cleanTitle,
        status: 'todo',
        parent: rootId,
        children: [],
        depends_on: []
      }
    });

    ops.push({ op: 'add_child', parent_id: rootId, child_id: sectionId });
  });

  const executionSection = finalSections.find(s =>
    /execution|implementation|development/i.test(s.title)
  );
  const executionId = executionSection
    ? sectionIdByTitle.get(executionSection.title.toLowerCase())
    : undefined;
  const executionBody = executionSection?.body ?? '';

  if (executionId) {
    const extracted = extractColonSubheads(executionBody);
    const fallback = extractExecutionSubsteps(executionBody);
    const substepTitles =
      extracted.length > 0 ? extracted :
      fallback.length > 0 ? fallback :
      EXECUTION_SUBSTEPS;

    console.log('[PlanWriter] execution substeps', substepTitles);

    substepTitles.forEach((title, i) => {
      const subId = `step_${slugify(title)}_${i + 1}_${ts}`;
      ops.push({
        op: 'upsert_step',
        step: {
          id: subId,
          title,
          status: 'todo',
          parent: executionId,
          children: [],
          depends_on: []
        }
      });
      ops.push({ op: 'add_child', parent_id: executionId, child_id: subId });
    });
  }

  const patch: Patch = { patch_id: patchId, ops };
  console.log('generated ids', { rootId, sections: sectionIdByTitle });
  console.log('patch ops', patch.ops.map(op => op.op));
  console.log('patch', patch);
  console.groupEnd();
  return patch;
}

type Section = {
  title: string;
  body: string;
};

const isLikelyHeading = (t: string) => {
  const title = normalizeStepTitle(t);
  if (!title) return false;
  if (title.length < 3 || title.length > 80) return false;
  if (/[.?!]$/.test(title)) return false;
  return true;
};

const extractSections = (text: string): Section[] => {
  const lines = text.split('\n');
  const headings: { title: string; index: number }[] = [];

  lines.forEach((line, index) => {
    const numbered = line.match(/^\s*\d+\.\s*(.+?)\s*$/);
    if (numbered) {
      const title = normalizeStepTitle(numbered[1]);
      if (isLikelyHeading(title)) headings.push({ title, index });
      return;
    }

    const colon = line.match(/^\s*([A-Za-z][A-Za-z0-9/&() \-]{2,80})\s*:\s*$/);
    if (colon) {
      const title = normalizeStepTitle(colon[1]);
      if (/^(in scope|out of scope)$/i.test(title)) return;
      if (isLikelyHeading(title)) headings.push({ title, index });
      return;
    }
  });

  const seen = new Set<string>();
  const unique = headings.filter(h => {
    const key = h.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.map((heading, idx) => {
    const start = heading.index + 1;
    const end = idx + 1 < unique.length ? unique[idx + 1].index : lines.length;
    const body = lines.slice(start, end).join('\n').trim();
    return { title: heading.title, body };
  });
};

const extractColonSubheads = (text: string): string[] => {
  if (!text) return [];
  const lines = text.split('\n');
  const titles: string[] = [];

  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z][A-Za-z0-9/&() \-]{2,80})\s*:\s*$/);
    if (!m) continue;
    const t = normalizeStepTitle(m[1]);
    if (!t) continue;
    if (/^(in scope|out of scope)$/i.test(t)) continue;
    if (/[.?!]$/.test(t)) continue;
    titles.push(t);
  }

  return [...new Set(titles.map(t => t.trim()))];
};

const extractExecutionSubsteps = (text: string): string[] => {
  if (!text) return [];
  const titles: string[] = [];
  for (const candidate of EXECUTION_SUBSTEPS) {
    if (new RegExp(candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text)) {
      titles.push(candidate);
    }
  }
  return titles;
};

type ApplyFromExchangeArgs = {
  projectId: string;
  userText: string;
  assistantText: string;
  baseContext: PlanContext;
  getToken: () => Promise<string | null>;
  onNewContext: (ctx: PlanContext) => void;
};

export function usePlanContextWriter() {
  const applyFromExchange = async ({
    projectId,
    userText,
    assistantText,
    baseContext,
    getToken,
    onNewContext
  }: ApplyFromExchangeArgs): Promise<void> => {
    const existingRootId = baseContext.root_step_ids[0] || null;
    if (existingRootId) {
      console.log('[PlanWriter] root exists, will attach new sections under existing root', { existingRootId });
    }

    if (isClarificationResponse(assistantText)) {
      console.log('[PlanWriter] clarification response detected, skipping');
      return;
    }

    if (!isPlanLikeResponse(assistantText)) {
      console.log('[PlanWriter] response not plan-like, skipping');
      return;
    }

    const patch =
      buildPlanPatchFromText({ assistantText, userText, rootId: existingRootId }) ?? null;

    if (!patch) {
      console.log('[PlanWriter] no patch generated, skipping');
      return;
    }

    const res = await applyProjectContextPatch({
      projectId,
      baseVersion: baseContext.version ?? createEmptyPlanContext().version,
      patch,
      getToken
    });

    if (res.ok) {
      onNewContext(res.context);
      return;
    }

    if (!res.ok && 'error' in res && res.error === 'version_conflict' && 'context' in res) {
      onNewContext(res.context);
      return;
    }
  };

  return { applyFromExchange };
}


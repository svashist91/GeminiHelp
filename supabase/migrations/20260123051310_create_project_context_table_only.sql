create table if not exists public.project_context (
  project_id uuid primary key
    references public.projects(id) on delete cascade,

  context_json jsonb not null default jsonb_build_object(
    'schema_version', 'plan@1',
    'version', 1,
    'root_step_ids', jsonb_build_array(),
    'steps', jsonb_build_object()
  ),

  version int not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_context_project_id_idx
  on public.project_context(project_id);

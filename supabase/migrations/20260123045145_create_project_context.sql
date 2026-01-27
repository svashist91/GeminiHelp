-- 1) Store one canonical context JSON per project
create table if not exists public.project_context (
  project_id uuid primary key
    references public.projects(id) on delete cascade,

  -- Canonical plan JSON (steps + relationships + status)
  context_json jsonb not null default jsonb_build_object(
    'schema_version', 1,
    'version', 1,
    'root_step_ids', jsonb_build_array(),
    'steps', jsonb_build_object()
  ),

  -- DB-side version (incremented by app later; starts at 1)
  version int not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_context_project_id_idx
  on public.project_context(project_id);

-- 2) Auto-create a context row whenever a project is created
create or replace function public.init_project_context()
returns trigger as $$
begin
  insert into public.project_context (project_id)
  values (new.id)
  on conflict (project_id) do nothing;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_init_project_context on public.projects;

create trigger trg_init_project_context
after insert on public.projects
for each row execute function public.init_project_context();

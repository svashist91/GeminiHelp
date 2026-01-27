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

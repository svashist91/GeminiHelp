-- ==============================================================================
-- 1. STORAGE CONFIGURATION
-- ==============================================================================

-- Create the Private Storage Bucket safely
insert into storage.buckets (id, name, public)
values ('session_evidence', 'session_evidence', false)
on conflict (id) do nothing;

-- Policy: ALLOW UPLOAD (INSERT)
-- User can only upload if the folder name matches their User ID
create policy "Allow authenticated uploads to own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'session_evidence' 
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: ALLOW VIEW (SELECT)
-- User can only view files in their own folder
create policy "Allow users to view own evidence"
on storage.objects for select
to authenticated
using (
  bucket_id = 'session_evidence' 
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ==============================================================================
-- 2. DATABASE CONFIGURATION
-- ==============================================================================

-- Create the Audit Logs Table
create table if not exists public.audit_logs (
  id uuid default gen_random_uuid() primary key,
  session_id text not null,
  user_id uuid default auth.uid(), -- Automatically captures the user
  image_path text not null,
  diff_percentage float,
  
  -- AI Fields (populated later by Lambda)
  summary text,
  tags text[],
  app_context text,
  
  created_at timestamp with time zone default now(),

  -- CONSTRAINT: Connect to Sessions Table (The "Hard Link")
  constraint fk_audit_logs_sessions
    foreign key (session_id)
    references public.sessions (id)
    on delete cascade
);

-- Enable Security (RLS)
alter table public.audit_logs enable row level security;

-- Policy: Users can insert their own logs
create policy "Users can insert their own audit logs"
on public.audit_logs for insert
to authenticated
with check (
  (user_id = auth.uid()) OR (user_id is null)
);

-- Policy: Users can view ONLY their own logs
create policy "Users can view their own audit logs"
on public.audit_logs for select
to authenticated
using (
  user_id = auth.uid()
);
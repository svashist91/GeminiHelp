-- Migration: update_rls_hierarchy

-- 1. Enable RLS on all relevant tables (Idempotent)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to ensure a clean slate
-- We remove old "direct user_id" policies to replace them with the new hierarchy
DROP POLICY IF EXISTS "Users can manage own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can see own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

DROP POLICY IF EXISTS "Users can manage own projects" ON public.projects;

DROP POLICY IF EXISTS "Users can manage own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Users can manage sessions via project" ON public.sessions;

DROP POLICY IF EXISTS "Users can see audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Users can manage logs via project" ON public.audit_logs;

-- 3. PROFILES: Direct Ownership
-- Logic: I can see/edit the row if the ID matches my Auth ID
CREATE POLICY "Users can manage own profile"
ON public.profiles
FOR ALL
USING ( id = auth.uid()::text );

-- 4. PROJECTS: Direct Ownership
-- Logic: I can see/edit the project if the user_id matches my Auth ID
CREATE POLICY "Users can manage own projects"
ON public.projects
FOR ALL
USING ( user_id = auth.uid()::text );

-- 5. SESSIONS: Indirect Ownership (via Project)
-- Logic: I can see the session IF it belongs to a project that I own.
CREATE POLICY "Users can manage sessions via project"
ON public.sessions
FOR ALL
USING (
  project_id IN (
    SELECT id FROM public.projects 
    WHERE user_id = auth.uid()::text
  )
);

-- 6. AUDIT LOGS: Indirect Ownership (via Project)
-- Logic: I can see the log IF it belongs to a project that I own.
CREATE POLICY "Users can manage logs via project"
ON public.audit_logs
FOR ALL
USING (
  project_id IN (
    SELECT id FROM public.projects 
    WHERE user_id = auth.uid()::text
  )
);

-- 7. Ensure Performance Indexes Exist
-- These prevent the "IN (SELECT...)" queries from becoming slow as data grows
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON public.sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_project_id ON public.audit_logs(project_id);
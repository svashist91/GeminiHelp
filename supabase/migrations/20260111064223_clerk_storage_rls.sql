/* ============================================================
   Clerk JWT based Storage RLS (session_evidence bucket)
   Path rule: <clerk_user_id>/<session_id>/<timestamp>.jpg
   ============================================================ */

-- alter table storage.objects enable row level security;

create or replace function public.clerk_uid()
returns text
language sql
stable
as $$
  select auth.jwt() ->> 'clerk_user_id';
$$;

/* INSERT (upload) */
create policy "session_evidence_insert_own_folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'session_evidence'
  and (storage.foldername(name))[1] = public.clerk_uid()
);

/* SELECT (list/download) */
create policy "session_evidence_select_own_folder"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'session_evidence'
  and (storage.foldername(name))[1] = public.clerk_uid()
);

/* UPDATE (upsert/rename) */
create policy "session_evidence_update_own_folder"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'session_evidence'
  and (storage.foldername(name))[1] = public.clerk_uid()
)
with check (
  bucket_id = 'session_evidence'
  and (storage.foldername(name))[1] = public.clerk_uid()
);

/* DELETE */
create policy "session_evidence_delete_own_folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'session_evidence'
  and (storage.foldername(name))[1] = public.clerk_uid()
);

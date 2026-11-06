-- =============================================================================
-- HRplus — storage buckets
-- Buckets used by the API:
--   receipts  expense receipts (upload.js + expenses handlers)
--   branding  company logo / invoice branding
--   backups   JSON exports written by backup.create and read by backup.restore
--
-- There is deliberately no `documents` bucket: HR letters are generated in the
-- browser (src/lib/docx.ts) and downloaded by the user, and the `documents`
-- table keeps only the metadata (template, language, who issued it). An empty
-- bucket with no writer and no policy is just unused attack surface.
-- Private buckets: the API serves files through signed URLs, never public links.
-- =============================================================================

-- `storage` is provisioned by Supabase itself. On a plain PostgreSQL (CI, or the
-- schema check in dev/) it does not exist, so skip rather than fail the migration.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not found — skipping bucket creation (apply this on Supabase)';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values
    ('receipts',  'receipts',  false, 10485760, array['image/png','image/jpeg','image/webp','application/pdf']),
    ('branding',  'branding',  true,  5242880,  array['image/png','image/jpeg','image/svg+xml','image/webp']),
    ('backups',   'backups',   false, 52428800, array['application/json','application/gzip'])
  on conflict (id) do nothing;

  -- If an earlier deployment created the unused `documents` bucket, leave it
  -- alone (dropping storage may hold customer files) but note it.
  if exists (select 1 from storage.buckets where id = 'documents') then
    raise notice 'unused documents bucket still exists — nothing writes to it; remove it manually if empty';
  end if;
end;
$$;

-- The API talks to storage with the service-role key, which bypasses these
-- policies. They exist so that a signed-in user cannot reach other people's
-- files if the anon key ever leaks into the client bundle.
do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'storage schema not found — skipping storage policies';
    return;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'hrplus_receipts_owner_read') then
    return;
  end if;

  -- receipts: path convention is <employee_id>/<file>
  execute $p$
    create policy hrplus_receipts_owner_read on storage.objects for select to authenticated
    using (
      bucket_id = 'receipts'
      and exists (
        select 1 from profiles p
        where p.user_id = auth.uid()
          and (p.role = 'admin' or p.employee_id = (storage.foldername(name))[1])
      )
    )
  $p$;

  execute $p$
    create policy hrplus_receipts_owner_write on storage.objects for insert to authenticated
    with check (
      bucket_id = 'receipts'
      and exists (
        select 1 from profiles p
        where p.user_id = auth.uid()
          and (p.role = 'admin' or p.employee_id = (storage.foldername(name))[1])
      )
    )
  $p$;

  -- backups are admin-only
  execute $p$
    create policy hrplus_backups_admin on storage.objects for all to authenticated
    using (bucket_id = 'backups' and exists (select 1 from profiles p where p.user_id = auth.uid() and p.role = 'admin'))
  $p$;

  -- branding is world-readable (it is the company logo)
  execute $p$
    create policy hrplus_branding_read on storage.objects for select to public
    using (bucket_id = 'branding')
  $p$;
end;
$$;

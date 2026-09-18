do $storage$
begin
  if to_regclass('storage.buckets') is not null
    and to_regclass('storage.objects') is not null then
    insert into storage.buckets (
      id,
      name,
      public,
      file_size_limit,
      allowed_mime_types
    ) values (
      'profile-media',
      'profile-media',
      true,
      2097152,
      array['image/jpeg','image/png','image/gif','image/webp']
    )
    on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

    execute 'drop policy if exists "Profile media public read" on storage.objects';
    execute 'drop policy if exists "Profile media own folder insert" on storage.objects';
    execute 'drop policy if exists "Profile media own folder update" on storage.objects';
    execute 'drop policy if exists "Profile media own folder delete" on storage.objects';

    execute 'create policy "Profile media public read" on storage.objects for select to anon, authenticated using (bucket_id = ''profile-media'')';
    execute 'create policy "Profile media own folder insert" on storage.objects for insert to authenticated with check (bucket_id = ''profile-media'' and owner_id = (select auth.uid()::text) and (storage.foldername(name))[1] = (select auth.uid())::text)';
    execute 'create policy "Profile media own folder update" on storage.objects for update to authenticated using (bucket_id = ''profile-media'' and owner_id = (select auth.uid()::text) and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = ''profile-media'' and owner_id = (select auth.uid()::text) and (storage.foldername(name))[1] = (select auth.uid())::text)';
    execute 'create policy "Profile media own folder delete" on storage.objects for delete to authenticated using (bucket_id = ''profile-media'' and owner_id = (select auth.uid()::text) and (storage.foldername(name))[1] = (select auth.uid())::text)';
  end if;
end
$storage$;

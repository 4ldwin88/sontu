do $storage$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists "Profile media own folder insert" on storage.objects';
    execute 'drop policy if exists "Profile media own folder update" on storage.objects';
    execute 'drop policy if exists "Profile media own folder delete" on storage.objects';

    execute 'create policy "Profile media own folder insert" on storage.objects for insert to authenticated with check (bucket_id = ''profile-media'' and (storage.foldername(name))[1] = (select auth.uid())::text)';
    execute 'create policy "Profile media own folder update" on storage.objects for update to authenticated using (bucket_id = ''profile-media'' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = ''profile-media'' and (storage.foldername(name))[1] = (select auth.uid())::text)';
    execute 'create policy "Profile media own folder delete" on storage.objects for delete to authenticated using (bucket_id = ''profile-media'' and (storage.foldername(name))[1] = (select auth.uid())::text)';
  end if;
end
$storage$;

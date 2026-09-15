-- Explicit beta feedback, separate from event truth and automatic telemetry.
create table public.sontu_dev_notes (
 id uuid primary key,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 body text not null check (length(trim(body)) between 1 and 4000),
 screen text not null check (screen in ('home','discover','events','feed','hosting','invitation','account','profile','other')),
 created_at timestamptz not null default now()
);
alter table public.sontu_dev_notes enable row level security;
revoke all on public.sontu_dev_notes from public,anon,authenticated;
grant select,insert on public.sontu_dev_notes to authenticated;
create policy own_notes_read on public.sontu_dev_notes for select to authenticated using ((select auth.uid())=user_id);
create policy own_notes_write on public.sontu_dev_notes for insert to authenticated with check ((select auth.uid())=user_id);
create index sontu_dev_notes_owner_time on public.sontu_dev_notes(user_id,created_at desc);

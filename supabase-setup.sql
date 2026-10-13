-- Alfred Facilities: one-time Supabase setup.
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run again.

-- 1. Shared data: one row per record (location, equipment, work order, …).
create table if not exists public.records (
  collection text not null,
  id         text not null,
  data       jsonb,
  deleted    boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (collection, id)
);
create index if not exists records_updated_at_idx on public.records (updated_at);

-- Server sets the timestamp + who made the change (phones' clocks can't be trusted).
create or replace function public.records_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.records_touch();

-- 2. Only signed-in team members can read or change anything.
alter table public.records enable row level security;
drop policy if exists "team can read"   on public.records;
drop policy if exists "team can add"    on public.records;
drop policy if exists "team can change" on public.records;
create policy "team can read"   on public.records for select to authenticated using (true);
create policy "team can add"    on public.records for insert to authenticated with check (true);
create policy "team can change" on public.records for update to authenticated using (true) with check (true);

-- 3. Live updates between devices.
do $$ begin
  alter publication supabase_realtime add table public.records;
exception when duplicate_object then null; end $$;

-- 4. Private storage for photos, floor plans and documents.
insert into storage.buckets (id, name, public) values ('files', 'files', false)
  on conflict (id) do nothing;
drop policy if exists "team files read"   on storage.objects;
drop policy if exists "team files add"    on storage.objects;
drop policy if exists "team files change" on storage.objects;
drop policy if exists "team files delete" on storage.objects;
create policy "team files read"   on storage.objects for select to authenticated using (bucket_id = 'files');
create policy "team files add"    on storage.objects for insert to authenticated with check (bucket_id = 'files');
create policy "team files change" on storage.objects for update to authenticated using (bucket_id = 'files');
create policy "team files delete" on storage.objects for delete to authenticated using (bucket_id = 'files');

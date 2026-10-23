-- Enable Authentication > Providers > Anonymous Sign-ins in Supabase.
create table if not exists public.macro_records (
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check (kind in ('entry','food','recipe','targets')),
 id text not null,
 payload jsonb not null,
 updated_at timestamptz not null default now(),
 primary key (user_id,kind,id)
);
alter table public.macro_records enable row level security;
create policy "Read own records" on public.macro_records for select to authenticated using ((select auth.uid())=user_id);
create policy "Insert own records" on public.macro_records for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Update own records" on public.macro_records for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
-- Deletions are persisted as tombstones inside payload, so queued offline updates remain replayable.
revoke all on public.macro_records from anon;
grant select,insert,update on public.macro_records to authenticated;
create or replace function public.macro_touch() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
create trigger macro_updated before update on public.macro_records for each row execute function public.macro_touch();

-- For existing optional Supabase installations; no auth/RLS changes.
alter table public.macro_records drop constraint if exists macro_records_kind_check;
alter table public.macro_records add constraint macro_records_kind_check check (kind in ('entry','food','recipe','targets','water'));

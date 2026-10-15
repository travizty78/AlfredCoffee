-- Alfred Facilities: let coworkers create their own accounts.
-- Only @alfred.la emails can sign up (plus emails on the allow list).
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run again.

-- Settings (not readable from the app).
create table if not exists public.signup_settings (
  id             int primary key default 1,
  team_code      text not null,
  allowed_domain text not null default 'alfred.la'
);
alter table public.signup_settings enable row level security;
insert into public.signup_settings (id, team_code, allowed_domain)
  values (1, 'Alfred-9616-Pistachio', 'alfred.la')
  on conflict (id) do update set team_code = excluded.team_code, allowed_domain = excluded.allowed_domain;

-- Extra emails allowed without a work address or code (admins).
create table if not exists public.allowed_emails (email text primary key);
alter table public.allowed_emails enable row level security;
insert into public.allowed_emails (email) values ('travizty78@gmail.com') on conflict do nothing;

-- Checked every time an account is created.
create or replace function public.check_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s record;
  addr text := lower(coalesce(new.email, ''));
begin
  if exists (select 1 from public.allowed_emails a where lower(a.email) = addr) then
    return new;
  end if;
  select * into s from public.signup_settings where id = 1;
  if s is null then
    raise exception 'Sign-ups are not set up yet';
  end if;
  if split_part(addr, '@', 2) <> lower(s.allowed_domain) then
    raise exception 'Only @% email addresses can sign up', s.allowed_domain;
  end if;
  return new;
end $$;

drop trigger if exists check_signup on auth.users;
create trigger check_signup before insert on auth.users
  for each row execute function public.check_signup();

-- To let a non-@alfred.la person in (e.g. a contractor):
--   insert into public.allowed_emails (email) values ('person@example.com');

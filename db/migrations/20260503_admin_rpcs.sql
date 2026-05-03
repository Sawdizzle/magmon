-- Magmon admin migration
-- Adds: app_admins membership view, role helpers, secure RPCs for company member
-- management, RLS policies that allow app admins full access and customer admins
-- to manage their own company. Idempotent — safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. company_members: ensure shape and role enum
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'company_role') then
    create type public.company_role as enum ('admin', 'member', 'viewer');
  end if;
end$$;

create table if not exists public.company_members (
  company_id text not null references public.companies(id) on delete cascade,
  user_id    uuid not null references auth.users(id)       on delete cascade,
  role       public.company_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create index if not exists company_members_user_id_idx on public.company_members(user_id);

-- ---------------------------------------------------------------------------
-- 2. app_admins (already used by the app — make sure it exists)
-- ---------------------------------------------------------------------------

create table if not exists public.app_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. helper functions: role checks (security definer to bypass RLS recursion)
-- ---------------------------------------------------------------------------

create or replace function public.is_app_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.app_admins where user_id = uid);
$$;

create or replace function public.is_company_admin(p_company_id text, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.company_members
    where company_id = p_company_id
      and user_id    = uid
      and role       = 'admin'
  );
$$;

create or replace function public.is_company_member(p_company_id text, uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.company_members
    where company_id = p_company_id
      and user_id    = uid
  );
$$;

revoke all on function public.is_app_admin(uuid) from public;
revoke all on function public.is_company_admin(text, uuid) from public;
revoke all on function public.is_company_member(text, uuid) from public;
grant execute on function public.is_app_admin(uuid)        to authenticated;
grant execute on function public.is_company_admin(text, uuid) to authenticated;
grant execute on function public.is_company_member(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. lookup user by email (registered users only — no invite backend yet)
-- ---------------------------------------------------------------------------

create or replace function public.find_user_by_email(p_email text)
returns table (user_id uuid, email text)
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id, u.email
  from auth.users u
  where lower(u.email) = lower(p_email)
  limit 1;
$$;

revoke all on function public.find_user_by_email(text) from public;
grant execute on function public.find_user_by_email(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. add_company_member RPC — used by Admin UI
--    Authorization: caller must be app admin OR admin of p_company_id
-- ---------------------------------------------------------------------------

create or replace function public.add_company_member(
  p_company_id text,
  p_email      text,
  p_role       public.company_role default 'member'
)
returns table (company_id text, user_id uuid, role public.company_role)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid := auth.uid();
  v_target uuid;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not (public.is_app_admin(v_caller) or public.is_company_admin(p_company_id, v_caller)) then
    raise exception 'not authorized to manage company %', p_company_id using errcode = '42501';
  end if;

  select u.id into v_target from auth.users u where lower(u.email) = lower(p_email);
  if v_target is null then
    raise exception 'no registered user with email %', p_email using errcode = 'P0002';
  end if;

  insert into public.company_members as cm (company_id, user_id, role)
  values (p_company_id, v_target, p_role)
  on conflict (company_id, user_id) do update set role = excluded.role
  returning cm.company_id, cm.user_id, cm.role
  into company_id, user_id, role;

  return next;
end;
$$;

revoke all on function public.add_company_member(text, text, public.company_role) from public;
grant execute on function public.add_company_member(text, text, public.company_role) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. remove_company_member RPC
-- ---------------------------------------------------------------------------

create or replace function public.remove_company_member(p_company_id text, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not (public.is_app_admin(v_caller) or public.is_company_admin(p_company_id, v_caller)) then
    raise exception 'not authorized to manage company %', p_company_id using errcode = '42501';
  end if;

  delete from public.company_members
  where company_id = p_company_id and user_id = p_user_id;
end;
$$;

revoke all on function public.remove_company_member(text, uuid) from public;
grant execute on function public.remove_company_member(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. set_company_member_role RPC
-- ---------------------------------------------------------------------------

create or replace function public.set_company_member_role(
  p_company_id text,
  p_user_id    uuid,
  p_role       public.company_role
)
returns public.company_role
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not (public.is_app_admin(v_caller) or public.is_company_admin(p_company_id, v_caller)) then
    raise exception 'not authorized to manage company %', p_company_id using errcode = '42501';
  end if;

  update public.company_members
     set role = p_role
   where company_id = p_company_id
     and user_id    = p_user_id;

  return p_role;
end;
$$;

revoke all on function public.set_company_member_role(text, uuid, public.company_role) from public;
grant execute on function public.set_company_member_role(text, uuid, public.company_role) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. set_app_admin RPC — only existing app admins can mint new app admins
-- ---------------------------------------------------------------------------

create or replace function public.set_app_admin(p_user_id uuid, p_is_admin boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if not public.is_app_admin(v_caller) then
    raise exception 'app admin only' using errcode = '42501';
  end if;
  if p_is_admin then
    insert into public.app_admins(user_id) values (p_user_id)
      on conflict (user_id) do nothing;
  else
    delete from public.app_admins where user_id = p_user_id;
  end if;
  return p_is_admin;
end;
$$;

revoke all on function public.set_app_admin(uuid, boolean) from public;
grant execute on function public.set_app_admin(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. list_company_members view (joins to email so the UI doesn't need direct
--    auth.users access)
-- ---------------------------------------------------------------------------

create or replace view public.v_company_members
with (security_invoker = true)
as
select
  cm.company_id,
  cm.user_id,
  cm.role,
  cm.created_at,
  u.email
from public.company_members cm
join auth.users u on u.id = cm.user_id;

grant select on public.v_company_members to authenticated;

-- ---------------------------------------------------------------------------
-- 10. RLS — companies and company_members
-- ---------------------------------------------------------------------------

alter table public.companies        enable row level security;
alter table public.company_members  enable row level security;
alter table public.app_admins       enable row level security;

drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
  for select to authenticated
  using (
    public.is_app_admin()
    or public.is_company_member(id)
  );

drop policy if exists companies_insert on public.companies;
create policy companies_insert on public.companies
  for insert to authenticated
  with check (public.is_app_admin());

drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies
  for update to authenticated
  using (public.is_app_admin() or public.is_company_admin(id))
  with check (public.is_app_admin() or public.is_company_admin(id));

drop policy if exists companies_delete on public.companies;
create policy companies_delete on public.companies
  for delete to authenticated
  using (public.is_app_admin());

drop policy if exists company_members_select on public.company_members;
create policy company_members_select on public.company_members
  for select to authenticated
  using (
    public.is_app_admin()
    or user_id = auth.uid()
    or public.is_company_admin(company_id)
  );

-- Writes to company_members must go through the RPCs above.
drop policy if exists company_members_no_direct_write on public.company_members;
create policy company_members_no_direct_write on public.company_members
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists app_admins_select on public.app_admins;
create policy app_admins_select on public.app_admins
  for select to authenticated
  using (public.is_app_admin() or user_id = auth.uid());

drop policy if exists app_admins_no_direct_write on public.app_admins;
create policy app_admins_no_direct_write on public.app_admins
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- ---------------------------------------------------------------------------
-- 11. Telemetry view (optional convenience for the client)
-- ---------------------------------------------------------------------------

create or replace view public.v_latest_telemetry
with (security_invoker = true)
as
select distinct on (asset_id) *
from public.telemetry
order by asset_id, ts desc;

grant select on public.v_latest_telemetry to authenticated;

begin;

create extension if not exists pgcrypto;
create type public.app_role as enum ('admin', 'store');

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code)),
  name text not null,
  area text not null default '',
  password_updated_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null,
  store_id uuid unique references public.stores(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_role_requires_store check (
    (role = 'store' and store_id is not null) or
    (role = 'admin' and store_id is null)
  )
);

create table public.menus (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  file_name text,
  storage_path text not null unique,
  is_published boolean not null default false,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  pdf_updated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.menu_store_assignments (
  menu_id uuid not null references public.menus(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (menu_id, store_id)
);

create index menu_assignments_store_idx on public.menu_store_assignments(store_id, menu_id);
create index menus_published_updated_idx on public.menus(is_published, updated_at desc);

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger stores_touch_updated_at before update on public.stores
for each row execute function public.touch_updated_at();
create trigger profiles_touch_updated_at before update on public.user_profiles
for each row execute function public.touch_updated_at();
create trigger menus_touch_updated_at before update on public.menus
for each row execute function public.touch_updated_at();

create or replace function public.current_user_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.user_profiles where user_id = auth.uid();
$$;
create or replace function public.current_store_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select store_id from public.user_profiles where user_id = auth.uid();
$$;
revoke all on function public.current_user_role() from public;
revoke all on function public.current_store_id() from public;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_store_id() to authenticated;

create or replace function public.record_store_login() returns void
language plpgsql security definer set search_path = '' as $$
declare target_store uuid := public.current_store_id();
begin
  if target_store is null then raise exception 'store profile is required'; end if;
  update public.stores set last_login_at = now() where id = target_store;
end;
$$;
revoke all on function public.record_store_login() from public;
grant execute on function public.record_store_login() to authenticated;

alter table public.stores enable row level security;
alter table public.user_profiles enable row level security;
alter table public.menus enable row level security;
alter table public.menu_store_assignments enable row level security;

create policy stores_read_own_or_admin on public.stores for select to authenticated
using (public.current_user_role() = 'admin' or id = public.current_store_id());
create policy stores_admin_write on public.stores for all to authenticated
using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy profiles_read_self_or_admin on public.user_profiles for select to authenticated
using (user_id = auth.uid() or public.current_user_role() = 'admin');
create policy profiles_admin_write on public.user_profiles for all to authenticated
using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy menus_read_assigned_or_admin on public.menus for select to authenticated
using (public.current_user_role() = 'admin' or (is_published and exists (
  select 1 from public.menu_store_assignments msa
  where msa.menu_id = menus.id and msa.store_id = public.current_store_id()
)));
create policy menus_admin_write on public.menus for all to authenticated
using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');
create policy assignments_read_own_or_admin on public.menu_store_assignments for select to authenticated
using (public.current_user_role() = 'admin' or store_id = public.current_store_id());
create policy assignments_admin_write on public.menu_store_assignments for all to authenticated
using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-pdfs', 'menu-pdfs', false, 20971520, array['application/pdf'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy menu_pdfs_read_assigned_or_admin on storage.objects for select to authenticated
using (bucket_id = 'menu-pdfs' and exists (
  select 1 from public.menus m where m.storage_path = name and (
    public.current_user_role() = 'admin' or (m.is_published and exists (
      select 1 from public.menu_store_assignments msa
      where msa.menu_id = m.id and msa.store_id = public.current_store_id()
    ))
  )
));
create policy menu_pdfs_admin_insert on storage.objects for insert to authenticated
with check (bucket_id = 'menu-pdfs' and public.current_user_role() = 'admin');
create policy menu_pdfs_admin_update on storage.objects for update to authenticated
using (bucket_id = 'menu-pdfs' and public.current_user_role() = 'admin')
with check (bucket_id = 'menu-pdfs' and public.current_user_role() = 'admin');
create policy menu_pdfs_admin_delete on storage.objects for delete to authenticated
using (bucket_id = 'menu-pdfs' and public.current_user_role() = 'admin');

commit;

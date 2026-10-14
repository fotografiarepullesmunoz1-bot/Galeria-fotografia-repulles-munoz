-- DAVID.FOTOTRL - GALERÍA FOTOGRÁFICA
-- Pega este archivo en Supabase > SQL Editor y pulsa Run.
-- Luego sigue README.md para crear el usuario administrador y autorizarlo.

create extension if not exists pgcrypto;

create table if not exists public.gallery_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  event_name text not null,
  dorsal text,
  description text,
  storage_path text not null unique,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.gallery_admins enable row level security;
alter table public.photos enable row level security;

-- Cada usuario autenticado solo puede ver su propia autorización.
drop policy if exists "Admins can read own row" on public.gallery_admins;
create policy "Admins can read own row"
on public.gallery_admins for select
to authenticated
using (user_id = (select auth.uid()));

-- Función segura para comprobar permisos de administrador.
create or replace function public.is_gallery_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.gallery_admins
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_gallery_admin() from public;
grant execute on function public.is_gallery_admin() to anon, authenticated;

drop policy if exists "Photos are public to read" on public.photos;
create policy "Photos are public to read"
on public.photos for select
to anon, authenticated
using (true);

drop policy if exists "Admins can add photos" on public.photos;
create policy "Admins can add photos"
on public.photos for insert
to authenticated
with check (public.is_gallery_admin() and uploaded_by = (select auth.uid()));

drop policy if exists "Admins can update photos" on public.photos;
create policy "Admins can update photos"
on public.photos for update
to authenticated
using (public.is_gallery_admin())
with check (public.is_gallery_admin());

drop policy if exists "Admins can delete photos" on public.photos;
create policy "Admins can delete photos"
on public.photos for delete
to authenticated
using (public.is_gallery_admin());

grant select on public.photos to anon, authenticated;
grant insert, update, delete on public.photos to authenticated;
grant select on public.gallery_admins to authenticated;

-- Bucket público: los originales son descargables por cualquier visitante.
-- La subida y el borrado siguen limitados por políticas RLS.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 52428800, array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view gallery files" on storage.objects;
create policy "Public can view gallery files"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'photos');

drop policy if exists "Only gallery admins can upload files" on storage.objects;
create policy "Only gallery admins can upload files"
on storage.objects for insert
to authenticated
with check (bucket_id = 'photos' and public.is_gallery_admin());

drop policy if exists "Only gallery admins can update files" on storage.objects;
create policy "Only gallery admins can update files"
on storage.objects for update
to authenticated
using (bucket_id = 'photos' and public.is_gallery_admin())
with check (bucket_id = 'photos' and public.is_gallery_admin());

drop policy if exists "Only gallery admins can delete files" on storage.objects;
create policy "Only gallery admins can delete files"
on storage.objects for delete
to authenticated
using (bucket_id = 'photos' and public.is_gallery_admin());

-- PASO FINAL: autorizar tu usuario administrador.
-- 1. En Supabase > Authentication > Users, crea un usuario con tu correo y contraseña.
-- 2. Copia el UUID/ID de ese usuario.
-- 3. Sustituye PEGA-AQUI-EL-UUID por el UUID real y ejecuta esta consulta.

insert into public.gallery_admins (user_id)
values ('PEGA-AQUI-EL-UUID')
on conflict (user_id) do nothing;

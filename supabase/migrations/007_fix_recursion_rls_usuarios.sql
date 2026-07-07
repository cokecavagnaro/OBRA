-- Ejecutar manualmente en el editor SQL de Supabase, YA — esta migración arregla
-- un incidente en producción causado por 006_rls_usuarios_admin.sql.
--
-- 006 agregó políticas en `usuarios` que hacían un subquery sobre la propia
-- tabla `usuarios` para resolver el cuenta_id/rol del que llama. Postgres
-- vuelve a aplicar RLS dentro de ese subquery, y como el subquery está en una
-- política de la misma tabla, entra en loop: "infinite recursion detected in
-- policy for relation usuarios" (42P17). Esto rompió toda lectura de usuarios
-- y, en cascada, obras/gastos (sus políticas también consultan usuarios).
--
-- Fix: mover la resolución de cuenta_id/rol a una función `security definer`
-- (mismo patrón ya usado en handle_new_user), que corre bypasseando RLS y no
-- vuelve a evaluar las políticas de usuarios.

drop policy if exists "admins ven usuarios de su cuenta" on usuarios;
drop policy if exists "admins editan usuarios de su cuenta" on usuarios;

create or replace function public.cuenta_id_si_soy_admin()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select cuenta_id from usuarios where id = auth.uid() and rol in ('admin', 'super_admin')
$$;

create policy "admins ven usuarios de su cuenta" on usuarios for select
  using (cuenta_id = public.cuenta_id_si_soy_admin());

create policy "admins editan usuarios de su cuenta" on usuarios for update
  using (cuenta_id = public.cuenta_id_si_soy_admin())
  with check (cuenta_id = public.cuenta_id_si_soy_admin());

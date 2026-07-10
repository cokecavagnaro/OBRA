-- Ejecutar manualmente en el editor SQL de Supabase.
-- Fix: la tabla `cuentas` solo tenía `grant select` y una política de SELECT
-- ("usuarios ven su cuenta"). Nunca se agregó permiso de UPDATE, así que
-- updateCuentaNombre() (Config > Cuenta > editar nombre) fallaba en silencio:
-- Supabase no tira error, RLS simplemente hace que el update afecte 0 filas.
-- El usuario veía el nombre nuevo en la UI (estado optimista) pero nunca se
-- guardaba, y volvía a aparecer el nombre viejo al recargar.
--
-- Reusa la función `cuenta_id_si_soy_admin()` (de 007_fix_recursion_rls_usuarios.sql)
-- para evitar el mismo problema de recursión de RLS sobre `usuarios`.

grant update on cuentas to authenticated;

create policy "admins editan su cuenta" on cuentas for update
  using (id = public.cuenta_id_si_soy_admin())
  with check (id = public.cuenta_id_si_soy_admin());

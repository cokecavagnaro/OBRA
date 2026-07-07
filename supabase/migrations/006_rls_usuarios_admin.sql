-- Ejecutar manualmente en el editor SQL de Supabase.
-- Fix: la única política de `usuarios` era "id = auth.uid()" (cada quien ve solo
-- su propia fila). Nunca se agregó una política para que un admin/super_admin
-- vea o edite a los demás usuarios de su cuenta, así que la lista de usuarios en
-- Config > Cuenta solo mostraba a quien estuviera logueado, y actualizarRolUsuario
-- / darDeBajaUsuario / reactivarUsuario fallaban en silencio contra cualquier
-- usuario que no fuera uno mismo.

create policy "admins ven usuarios de su cuenta" on usuarios for select
  using (
    cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and rol in ('admin', 'super_admin'))
  );

create policy "admins editan usuarios de su cuenta" on usuarios for update
  using (
    cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and rol in ('admin', 'super_admin'))
  )
  with check (
    cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and rol in ('admin', 'super_admin'))
  );

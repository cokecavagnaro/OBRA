-- Ejecutar manualmente en el editor SQL de Supabase.
-- Fase C: permisos personalizados al invitar (staging antes de que el usuario exista)
-- + fix de bug de producción (search_path) + endurecer RLS de user_permission_overrides.

-- 1. Tabla de staging: overrides de permisos para invitaciones aún no aceptadas
create table invitacion_permission_overrides (
  invitacion_id uuid references invitaciones(id) on delete cascade,
  permission_key text not null,
  granted boolean not null,
  primary key (invitacion_id, permission_key)
);

grant select, insert, update, delete on invitacion_permission_overrides to authenticated;
alter table invitacion_permission_overrides enable row level security;

create policy "admins gestionan overrides de invitaciones de su cuenta" on invitacion_permission_overrides for all
  using (
    exists (
      select 1 from invitaciones
      where invitaciones.id = invitacion_permission_overrides.invitacion_id
        and invitaciones.cuenta_id = (
          select cuenta_id from usuarios where id = auth.uid() and rol in ('admin', 'super_admin')
        )
    )
  );

-- 2. handle_new_user: copiar los overrides staged al usuario recién creado y limpiar.
--    FIX DE BUG EN PRODUCCIÓN: se agrega `set search_path = public` porque los triggers
--    sobre auth.users a veces corren sin "public" en el search_path, lo que hacía fallar
--    con "relation invitaciones does not exist" (SQLSTATE 42P01) aunque la tabla sí existe.
--    Esto rompía el envío del magic link a usuarios invitados.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  nueva_cuenta_id uuid;
  invitacion record;
begin
  select * into invitacion from invitaciones where email = new.email and usada = false limit 1;

  if invitacion.id is not null then
    insert into usuarios (id, cuenta_id, email, nombre, rol)
    values (new.id, invitacion.cuenta_id, new.email, new.raw_user_meta_data->>'nombre', invitacion.rol);

    insert into user_permission_overrides (user_id, permission_key, granted)
    select new.id, permission_key, granted
    from invitacion_permission_overrides
    where invitacion_id = invitacion.id;

    delete from invitacion_permission_overrides where invitacion_id = invitacion.id;

    update invitaciones set usada = true where id = invitacion.id;
  else
    insert into cuentas (nombre)
      values (coalesce(new.raw_user_meta_data->>'nombre_empresa', 'Mi empresa'))
      returning id into nueva_cuenta_id;
    insert into usuarios (id, cuenta_id, email, nombre, rol)
    values (new.id, nueva_cuenta_id, new.email, new.raw_user_meta_data->>'nombre', 'super_admin');
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 3. Endurecer la política laxa de user_permission_overrides: hoy cualquier usuario
--    activo de la cuenta puede escribir permisos de otro usuario por API directa;
--    debe exigir admin/super_admin, igual que ya exige "invitaciones".
drop policy "cuenta gestiona overrides de sus usuarios" on user_permission_overrides;

create policy "admins gestionan overrides de sus usuarios" on user_permission_overrides for all
  using (exists (
    select 1 from usuarios objetivo, usuarios yo
    where objetivo.id = user_permission_overrides.user_id and yo.id = auth.uid()
    and objetivo.cuenta_id = yo.cuenta_id
    and yo.rol in ('admin', 'super_admin')
  ));

-- Ejecutar manualmente en el editor SQL de Supabase.
-- Fase B: invitación de usuarios (vía magic link), permisos granulares
-- (overrides por usuario) y dar de baja/reactivar usuarios.

-- Dar de baja usuarios (soft — no borra la fila, solo la desactiva)
alter table usuarios add column activo boolean not null default true;

-- Invitaciones pendientes
create table invitaciones (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid references cuentas(id) on delete cascade,
  email text not null,
  rol text check (rol in ('admin','usuario')) default 'usuario',
  invitado_por uuid references usuarios(id),
  usada boolean default false,
  created_at timestamptz default now(),
  unique (cuenta_id, email)
);

-- Overrides puntuales de permisos por usuario (excepciones a su rol)
create table user_permission_overrides (
  user_id uuid references usuarios(id) on delete cascade,
  permission_key text not null,
  granted boolean not null,
  primary key (user_id, permission_key)
);

grant select, insert, update, delete on invitaciones to authenticated;
grant select, insert, update, delete on user_permission_overrides to authenticated;

alter table invitaciones enable row level security;
alter table user_permission_overrides enable row level security;

create policy "admins gestionan invitaciones de su cuenta" on invitaciones for all
  using (cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and rol in ('admin','super_admin')));

create policy "cuenta gestiona overrides de sus usuarios" on user_permission_overrides for all
  using (exists (
    select 1 from usuarios objetivo, usuarios yo
    where objetivo.id = user_permission_overrides.user_id and yo.id = auth.uid()
    and objetivo.cuenta_id = yo.cuenta_id
  ));

-- Bootstrap: ahora revisa invitaciones pendientes antes de crear cuenta nueva
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
$$ language plpgsql security definer;

-- Todas las políticas "por cuenta" de la Fase A deben exigir además que el
-- usuario esté activo, para que "dar de baja" realmente le corte el acceso.

drop policy "usuarios de la cuenta acceden a sus obras" on obras;
create policy "usuarios de la cuenta acceden a sus obras" on obras for all
  using (cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo))
  with check (cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo));

drop policy "usuarios de la cuenta acceden a etapas de sus obras" on etapas;
create policy "usuarios de la cuenta acceden a etapas de sus obras" on etapas for all
  using (exists (
    select 1 from obras where obras.id = etapas.obra_id
    and obras.cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo)
  ))
  with check (exists (
    select 1 from obras where obras.id = etapas.obra_id
    and obras.cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo)
  ));

drop policy "usuarios de la cuenta acceden a partidas de sus obras" on partidas;
create policy "usuarios de la cuenta acceden a partidas de sus obras" on partidas for all
  using (exists (
    select 1 from obras where obras.id = partidas.obra_id
    and obras.cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo)
  ))
  with check (exists (
    select 1 from obras where obras.id = partidas.obra_id
    and obras.cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo)
  ));

drop policy "usuarios de la cuenta acceden a gastos de sus obras" on gastos;
create policy "usuarios de la cuenta acceden a gastos de sus obras" on gastos for all
  using (exists (
    select 1 from obras where obras.id = gastos.obra_id
    and obras.cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo)
  ))
  with check (exists (
    select 1 from obras where obras.id = gastos.obra_id
    and obras.cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo)
  ));

drop policy "usuarios de la cuenta acceden a items de sus gastos" on items_gasto;
create policy "usuarios de la cuenta acceden a items de sus gastos" on items_gasto for all
  using (exists (
    select 1 from gastos join obras on obras.id = gastos.obra_id
    where gastos.id = items_gasto.gasto_id
    and obras.cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo)
  ))
  with check (exists (
    select 1 from gastos join obras on obras.id = gastos.obra_id
    where gastos.id = items_gasto.gasto_id
    and obras.cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo)
  ));

drop policy "usuarios de la cuenta acceden a aprendizaje de sus obras" on clasificaciones_aprendidas;
create policy "usuarios de la cuenta acceden a aprendizaje de sus obras" on clasificaciones_aprendidas for all
  using (exists (
    select 1 from obras where obras.id = clasificaciones_aprendidas.obra_id
    and obras.cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo)
  ))
  with check (exists (
    select 1 from obras where obras.id = clasificaciones_aprendidas.obra_id
    and obras.cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo)
  ));

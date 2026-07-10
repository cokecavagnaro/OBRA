-- Ejecutar manualmente en el editor SQL de Supabase.
-- Renombra la entidad de negocio "Obra" a "Proyecto": tabla obras->proyectos
-- y columna obra_id->proyecto_id en etapas, partidas, gastos y
-- clasificaciones_aprendidas. El rename de tabla/columna es solo metadata
-- (instantáneo, no reescribe filas, y Postgres preserva FKs y grants porque
-- se rastrean por OID, no por nombre). Lo que SÍ hay que recrear a mano son
-- las políticas RLS, porque su cuerpo (using/with check) referencia "obras"/
-- "obra_id" como texto y eso no se actualiza solo. El texto de cada política
-- de abajo es literal de 002_cuentas_roles.sql + 003_permisos_invitaciones.sql
-- (la última vez que se tocaron, nada posterior las modificó).

alter table obras rename to proyectos;
alter table etapas rename column obra_id to proyecto_id;
alter table partidas rename column obra_id to proyecto_id;
alter table gastos rename column obra_id to proyecto_id;
alter table clasificaciones_aprendidas rename column obra_id to proyecto_id;

drop policy if exists "usuarios de la cuenta acceden a sus obras" on proyectos;
create policy "usuarios de la cuenta acceden a sus proyectos" on proyectos for all
  using (cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo))
  with check (cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo));

drop policy if exists "usuarios de la cuenta acceden a etapas de sus obras" on etapas;
create policy "usuarios de la cuenta acceden a etapas de sus proyectos" on etapas for all
  using (exists (
    select 1 from proyectos where proyectos.id = etapas.proyecto_id
    and proyectos.cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo)
  ))
  with check (exists (
    select 1 from proyectos where proyectos.id = etapas.proyecto_id
    and proyectos.cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo)
  ));

drop policy if exists "usuarios de la cuenta acceden a partidas de sus obras" on partidas;
create policy "usuarios de la cuenta acceden a partidas de sus proyectos" on partidas for all
  using (exists (
    select 1 from proyectos where proyectos.id = partidas.proyecto_id
    and proyectos.cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo)
  ))
  with check (exists (
    select 1 from proyectos where proyectos.id = partidas.proyecto_id
    and proyectos.cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo)
  ));

drop policy if exists "usuarios de la cuenta acceden a gastos de sus obras" on gastos;
create policy "usuarios de la cuenta acceden a gastos de sus proyectos" on gastos for all
  using (exists (
    select 1 from proyectos where proyectos.id = gastos.proyecto_id
    and proyectos.cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo)
  ))
  with check (exists (
    select 1 from proyectos where proyectos.id = gastos.proyecto_id
    and proyectos.cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo)
  ));

drop policy if exists "usuarios de la cuenta acceden a items de sus gastos" on items_gasto;
create policy "usuarios de la cuenta acceden a items de sus gastos" on items_gasto for all
  using (exists (
    select 1 from gastos join proyectos on proyectos.id = gastos.proyecto_id
    where gastos.id = items_gasto.gasto_id
    and proyectos.cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo)
  ))
  with check (exists (
    select 1 from gastos join proyectos on proyectos.id = gastos.proyecto_id
    where gastos.id = items_gasto.gasto_id
    and proyectos.cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo)
  ));

drop policy if exists "usuarios de la cuenta acceden a aprendizaje de sus obras" on clasificaciones_aprendidas;
create policy "usuarios de la cuenta acceden a aprendizaje de sus proyectos" on clasificaciones_aprendidas for all
  using (exists (
    select 1 from proyectos where proyectos.id = clasificaciones_aprendidas.proyecto_id
    and proyectos.cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo)
  ))
  with check (exists (
    select 1 from proyectos where proyectos.id = clasificaciones_aprendidas.proyecto_id
    and proyectos.cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo)
  ));

-- Defensivo (debería ser no-op — Postgres preserva grants en un rename por
-- OID — pero este proyecto ya encontró grants faltantes varias veces en
-- tablas creadas fuera de las migraciones trackeadas, así que se confirma).
grant select on proyectos to service_role;

-- Dato: si algún usuario ya tiene guardado el override 'create_obras', pasarlo
-- a 'create_proyectos' para que no pierda el permiso silenciosamente.
update user_permission_overrides set permission_key = 'create_proyectos' where permission_key = 'create_obras';
update invitacion_permission_overrides set permission_key = 'create_proyectos' where permission_key = 'create_obras';

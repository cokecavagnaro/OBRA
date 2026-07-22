-- Fixes encontrados en la auditoría de RLS hecha antes de armar el plan de
-- QA automatizado. Cuatro problemas reales, no hipotéticos:

-- 1) item_gasto_eventos (015) y gasto_eventos (017) no filtraban por
-- usuarios.activo, a diferencia del patrón usado en el resto de las tablas
-- desde la migración 003 en adelante. Un usuario dado de baja pero con
-- sesión JWT todavía viva podía seguir leyendo/insertando eventos de
-- historial de su cuenta.
drop policy if exists "usuarios de la cuenta acceden a eventos de sus gastos" on item_gasto_eventos;
create policy "usuarios de la cuenta acceden a eventos de sus gastos" on item_gasto_eventos for all
  using (
    gasto_id in (
      select id from gastos where proyecto_id in (
        select id from proyectos where cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo)
      )
    )
  );

drop policy if exists "usuarios de la cuenta acceden a eventos de aprobacion" on gasto_eventos;
create policy "usuarios de la cuenta acceden a eventos de aprobacion" on gasto_eventos for all
  using (proyecto_id in (select id from proyectos where cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo)))
  with check (proyecto_id in (select id from proyectos where cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo)));

-- 2) Mismo problema en las dos funciones security definer: un admin/usuario
-- dado de baja seguía resolviendo su cuenta_id como si siguiera activo, lo
-- que le permitía seguir viendo/editando usuarios de su cuenta (007) y
-- subiendo/leyendo boletas en Storage (009) después de ser desactivado.
create or replace function public.cuenta_id_si_soy_admin()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select cuenta_id from usuarios where id = auth.uid() and activo and rol in ('admin', 'super_admin')
$$;

create or replace function public.mi_cuenta_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select cuenta_id from usuarios where id = auth.uid() and activo
$$;

-- 3) La política de insert de `notificaciones` solo validaba cuenta_id, sin
-- validar el destinatario: cualquier usuario de la cuenta podía insertar una
-- notificación arbitraria dirigida a cualquier compañero, con cualquier
-- mensaje. El envío a terceros (aprobado/rechazado, solicitud de
-- aprobación) ahora corre server-side con service role
-- (app/api/notificar-solicitante, app/api/solicitar-aprobacion), así que el
-- cliente autenticado ya no necesita insertar notificaciones para otra
-- persona — se endurece a que cada quien solo pueda insertar para sí mismo.
drop policy if exists "usuarios de la cuenta crean notificaciones para companeros" on notificaciones;
create policy "usuarios crean sus propias notificaciones" on notificaciones for insert
  with check (usuario_id = auth.uid());

-- 4) Grants de service_role faltantes — mismo patrón de bug ya recurrente en
-- este proyecto (ver 005/010/012/018): tablas/columnas nuevas sin GRANT
-- explícito quedan con "permission denied" para service_role aunque RLS y
-- todo lo demás estén bien.
grant select, insert, update, delete on item_gasto_eventos to service_role;
grant select, insert, update, delete on cuentas to service_role;
grant select, insert, update, delete on clasificaciones_aprendidas to service_role;
grant insert, delete on gastos to service_role;
grant insert, update, delete on proyectos to service_role;
grant insert, update, delete on user_permission_overrides to service_role;

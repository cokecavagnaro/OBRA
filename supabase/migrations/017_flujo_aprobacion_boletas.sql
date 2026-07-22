-- Flujo de aprobación de boletas. Un solo campo de estado (no "requiere
-- aprobación" separado de "estado"): una boleta subida por admin/super_admin
-- nace directo en 'aprobado' y nunca transita por pendiente/rechazado.
alter table gastos add column if not exists estado_aprobacion text not null default 'aprobado'
  check (estado_aprobacion in ('pendiente', 'aprobado', 'rechazado'));
alter table gastos add column if not exists solicitante_id uuid references usuarios(id);
alter table gastos add column if not exists aprobado_por_id uuid references usuarios(id);
-- Se denormaliza el email igual que creado_por_email (migración 013): la RLS
-- de usuarios no deja resolver el email de un compañero vía join desde el
-- cliente de otro usuario.
alter table gastos add column if not exists aprobado_por_email text;
alter table gastos add column if not exists fecha_solicitud timestamptz;
alter table gastos add column if not exists fecha_resolucion timestamptz;
alter table gastos add column if not exists motivo_rechazo text;

-- Historial a nivel de boleta completa (solicitud, edición, rechazo,
-- reenvío, aprobación, eliminación) — análogo a item_gasto_eventos pero con
-- una diferencia clave: el evento 'eliminada' debe sobrevivir al borrado
-- físico de su propia boleta, así que gasto_id va SIN fk (a propósito) y la
-- RLS se ancla a proyecto_id en vez de a gasto_id -> gastos.proyecto_id.
create table if not exists gasto_eventos (
  id uuid primary key default gen_random_uuid(),
  gasto_id uuid,
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  gasto_proveedor text not null,
  gasto_total numeric not null,
  accion text not null check (accion in ('solicitada', 'editada', 'aprobada', 'rechazada', 'reenviada', 'eliminada')),
  estado_anterior text,
  estado_nuevo text,
  comentario text,
  usuario_id uuid references usuarios(id),
  usuario_email text not null,
  created_at timestamptz not null default now()
);

alter table gasto_eventos enable row level security;

create policy "usuarios de la cuenta acceden a eventos de aprobacion" on gasto_eventos for all
  using (proyecto_id in (select id from proyectos where cuenta_id = (select cuenta_id from usuarios where id = auth.uid())))
  with check (proyecto_id in (select id from proyectos where cuenta_id = (select cuenta_id from usuarios where id = auth.uid())));

grant select, insert, update, delete on gasto_eventos to authenticated;

-- Bandeja simple de notificaciones in-app (solicitud/aprobación/rechazo).
create table if not exists notificaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  cuenta_id uuid not null references cuentas(id) on delete cascade,
  tipo text not null check (tipo in ('solicitud_aprobacion', 'boleta_aprobada', 'boleta_rechazada')),
  gasto_id uuid references gastos(id) on delete cascade,
  mensaje text not null,
  leida boolean not null default false,
  created_at timestamptz not null default now()
);

alter table notificaciones enable row level security;

create policy "usuarios ven sus propias notificaciones" on notificaciones for select
  using (usuario_id = auth.uid());

create policy "usuarios marcan como leidas sus propias notificaciones" on notificaciones for update
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Por cuenta_id (no usuario_id = auth.uid()): quien solicita una aprobación
-- necesita poder crear, con su propia sesión, una notificación destinada a
-- otra persona (el aprobador) — mismo patrón cuenta-wide ya usado en
-- gastos/etapas.
create policy "usuarios de la cuenta crean notificaciones para companeros" on notificaciones for insert
  with check (cuenta_id = (select cuenta_id from usuarios where id = auth.uid()));

grant select, insert, update on notificaciones to authenticated;

-- Ejecutar manualmente en el editor SQL de Supabase.
--
-- Ingresos de dinero por proyecto: transferencias que entran al proyecto,
-- cargadas a mano o leídas desde la foto de un comprobante. Cuelgan del
-- proyecto (igual que gastos), así que la RLS se ancla a proyecto_id ->
-- proyectos.cuenta_id con el mismo patrón y el mismo filtro por
-- usuarios.activo de la migración 019.

create table ingresos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  remitente text not null,
  cuenta_destino text not null default '',
  monto numeric not null check (monto > 0),
  fecha date not null,
  nota text,
  imagen_url text,
  origen text not null default 'manual' check (origen in ('manual', 'foto')),
  -- Se denormaliza el email igual que gastos.creado_por_email (migración
  -- 013): la RLS de usuarios no deja resolver el email de un compañero vía
  -- join desde el cliente de otro usuario.
  creado_por_email text,
  created_at timestamptz not null default now()
);

create index ingresos_proyecto_fecha_idx on ingresos (proyecto_id, fecha desc);

alter table ingresos enable row level security;

create policy "usuarios de la cuenta acceden a ingresos de sus proyectos" on ingresos for all
  using (proyecto_id in (select id from proyectos where cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo)))
  with check (proyecto_id in (select id from proyectos where cuenta_id = (select cuenta_id from usuarios where id = auth.uid() and activo)));

grant select, insert, update, delete on ingresos to authenticated;
grant select, insert, update, delete on ingresos to service_role;

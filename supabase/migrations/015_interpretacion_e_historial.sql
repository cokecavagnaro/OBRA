-- Interpretación (neto/bruto) fija por boleta, guardada una sola vez al
-- crearla, para que editar/borrar ítems después no tenga que volver a
-- adivinarla comparando contra un total que está a punto de cambiar.
alter table gastos add column if not exists interpretacion_precios text check (interpretacion_precios in ('neto', 'bruto'));

-- Historial de ediciones/borrados de ítems, con snapshot de la descripción
-- (el ítem puede ya no existir si se borró) y comentario opcional de quién
-- hizo el cambio.
create table if not exists item_gasto_eventos (
  id uuid primary key default gen_random_uuid(),
  gasto_id uuid not null references gastos(id) on delete cascade,
  item_id uuid,
  descripcion_item text not null,
  accion text not null check (accion in ('editado', 'eliminado')),
  subtotal_anterior numeric not null,
  subtotal_nuevo numeric,
  comentario text,
  usuario_email text not null,
  created_at timestamptz not null default now()
);

alter table item_gasto_eventos enable row level security;

create policy "usuarios de la cuenta acceden a eventos de sus gastos" on item_gasto_eventos for all
  using (
    gasto_id in (
      select id from gastos where proyecto_id in (
        select id from proyectos where cuenta_id = (select cuenta_id from usuarios where id = auth.uid())
      )
    )
  );

-- Mismo problema de siempre en este proyecto (ver migración 012): una tabla
-- nueva sin GRANT explícito queda con "permission denied" para authenticated
-- aunque la política RLS esté bien — RLS solo filtra filas, no reemplaza el
-- permiso de tabla.
grant select, insert, update, delete on item_gasto_eventos to authenticated;

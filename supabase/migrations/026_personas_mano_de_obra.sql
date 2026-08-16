-- Ejecutar manualmente en el editor SQL de Supabase.
--
-- Mano de obra: trabajadores (personas) compartidos por toda la cuenta, no
-- por proyecto -- la misma persona puede aparecer en varios proyectos.
-- Mismo patrón de scoping directo por cuenta_id que "obras/proyectos" en la
-- migración 002 (comparación directa, sin tabla intermedia proyecto_id ->
-- cuenta_id, porque personas no cuelga de un proyecto).

create table personas (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references cuentas(id) on delete cascade,
  nombre text not null,
  rut text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Evita duplicados por typo dentro de la misma cuenta (ej. "Juan Perez" vs
-- "juan perez"). Parcial sobre activo=true: si una persona se desactiva,
-- su nombre queda libre para una fila nueva sin chocar con la fila vieja.
create unique index personas_cuenta_nombre_activo_unique
  on personas (cuenta_id, lower(nombre)) where activo;

alter table personas enable row level security;

create policy "usuarios de la cuenta acceden a personas de su cuenta" on personas for all
  using (cuenta_id = (select cuenta_id from usuarios where id = auth.uid()))
  with check (cuenta_id = (select cuenta_id from usuarios where id = auth.uid()));

grant select, insert, update, delete on personas to authenticated;
grant select, insert, update, delete on personas to service_role;

-- items_gasto es donde ya viven cantidad/unidad/precio_unitario/subtotal --
-- un ítem de mano de obra mapea 1:1 sobre esa forma (cantidad=días/horas,
-- unidad='día'/'hora'/'global', precio_unitario=jornal/monto, subtotal=total),
-- y gastoDeItems/itemARow/filtros en app/proyecto/[id]/page.tsx ya operan a
-- nivel de ítem -- por eso persona_id va en items_gasto y no en gastos.
alter table items_gasto add column if not exists persona_id uuid references personas(id) on delete set null;

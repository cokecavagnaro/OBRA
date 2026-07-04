-- Ejecutar manualmente en el editor SQL de Supabase.
-- Guarda la clasificación (categoría + etiquetas) que el usuario confirmó
-- para cada producto, para que la próxima vez que se escanee el mismo
-- producto en la misma obra, la IA no tenga que volver a proponerla.

create table clasificaciones_aprendidas (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid references obras(id) on delete cascade,
  descripcion_normalizada text not null,
  categoria text,
  etiquetas text[] default '{}',
  veces_confirmado int default 1,
  updated_at timestamptz default now(),
  unique (obra_id, descripcion_normalizada)
);

alter table clasificaciones_aprendidas enable row level security;

create policy "usuarios autenticados leen aprendizaje" on clasificaciones_aprendidas
  for select using (auth.role() = 'authenticated');
create policy "usuarios autenticados escriben aprendizaje" on clasificaciones_aprendidas
  for insert with check (auth.role() = 'authenticated');
create policy "usuarios autenticados actualizan aprendizaje" on clasificaciones_aprendidas
  for update using (auth.role() = 'authenticated');

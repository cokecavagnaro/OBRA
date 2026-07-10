-- Ejecutar manualmente en el editor SQL de Supabase.
-- Fix: las imágenes de boletas nunca se subían a Supabase Storage. lib/imagen.ts
-- genera un blob pensado justo para eso, pero app/scan/page.tsx guardaba
-- directo en gastos.imagen_url el data URL base64 completo de la imagen
-- (varios MB de texto por boleta). Cada carga de gastos (getAllGastos/getGastos)
-- traía ese peso completo, y cualquier re-render pesado (ej. un click de filtro)
-- quedaba compitiendo por el hilo principal con la reconciliación de ese texto
-- gigante — de ahí que los filtros parecieran "no responder" en cuentas con
-- historial.
--
-- Este bucket + políticas habilitan que app/scan/page.tsx suba la imagen real
-- y guarde solo la URL pública en imagen_url.

insert into storage.buckets (id, name, public)
values ('boletas', 'boletas', true)
on conflict (id) do nothing;

create or replace function public.mi_cuenta_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select cuenta_id from usuarios where id = auth.uid()
$$;

-- Convención de path: {cuenta_id}/{obra_id}/{archivo}.jpg — así cada cuenta solo
-- puede subir/listar objetos bajo su propia carpeta.
create policy "usuarios suben boletas de su cuenta" on storage.objects for insert
  with check (bucket_id = 'boletas' and (storage.foldername(name))[1] = public.mi_cuenta_id()::text);

create policy "usuarios ven boletas de su cuenta" on storage.objects for select
  using (bucket_id = 'boletas' and (storage.foldername(name))[1] = public.mi_cuenta_id()::text);

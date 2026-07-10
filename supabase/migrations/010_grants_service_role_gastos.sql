-- Ejecutar manualmente en el editor SQL de Supabase.
-- Necesario para correr scripts/migrar-imagenes-storage.js (backfill de las
-- boletas guardadas con base64 en imagen_url antes del fix de Storage), que
-- necesita leer gastos.imagen_url + obras.cuenta_id (para el path del archivo
-- en Storage) y actualizar gastos.imagen_url con la URL final.
-- Mismo problema de siempre: estas tablas nunca tuvieron grants para
-- service_role (confirmado con "permission denied for table gastos/obras"
-- al consultarlas con la service role key).

grant select, update on gastos to service_role;
grant select on obras to service_role;

-- Ejecutar manualmente en el editor SQL de Supabase.
-- La tabla clasificaciones_aprendidas se creó en 001_clasificaciones_aprendidas.sql
-- con políticas RLS basadas en auth.role() = 'authenticated', pero nunca se le dio
-- el GRANT de tabla a `authenticated` (mismo patrón de siempre en este proyecto:
-- tablas creadas fuera del flujo de migraciones trackeado se quedan sin grants).
-- Efecto: cada vez que se guarda un ítem con etiquetas, el upsert de aprendizaje
-- de clasificación falla en silencio con "permission denied for table
-- clasificaciones_aprendidas" — no rompe el guardado del gasto, pero la IA nunca
-- aprende esa clasificación para escaneos futuros del mismo proyecto.

grant select, insert, update on clasificaciones_aprendidas to authenticated;

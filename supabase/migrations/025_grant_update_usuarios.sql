-- Ejecutar manualmente en el editor SQL de Supabase.
--
-- Bug: la política RLS "admins editan usuarios de su cuenta" (migración 007)
-- existe desde hace rato, pero nunca se le dio el permiso base UPDATE a la
-- tabla (migración 002 solo dio SELECT a `authenticated`). Sin el GRANT base,
-- Postgres bloquea la operación antes de evaluar la policy — esto rompe en
-- silencio "Editar rol" / "Dar de baja" / "Reactivar" en Configuración.
--
-- De paso se le da UPDATE y DELETE a `service_role` sobre usuarios, que
-- tampoco los tenía (solo SELECT, migración 018) y hacía falta para
-- correcciones administrativas directas vía Admin API.

grant update on usuarios to authenticated;
grant update, delete on usuarios to service_role;

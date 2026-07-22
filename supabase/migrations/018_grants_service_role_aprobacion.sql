-- Mismo problema de siempre (ver 005/010/012): tablas nuevas sin GRANT
-- explícito quedan con "permission denied" para service_role, necesario
-- tanto para app/api/solicitar-aprobacion/route.ts (lee usuarios/overrides,
-- inserta notificaciones) como para debug/soporte vía la service role key.
grant select, insert, update, delete on gasto_eventos to service_role;
grant select, insert, update, delete on notificaciones to service_role;
grant select on usuarios to service_role;
grant select on user_permission_overrides to service_role;

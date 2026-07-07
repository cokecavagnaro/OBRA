-- Ejecutar manualmente en el editor SQL de Supabase.
-- Fix: el endpoint app/api/invitar-usuario/route.ts usa el cliente admin
-- (service_role) para insertar en invitaciones/invitacion_permission_overrides.
-- service_role bypassea RLS, pero igual necesita el GRANT de tabla básico
-- (la migración 004 solo se lo había dado a "authenticated"). Sin esto falla
-- con "permission denied for table invitaciones" (confirmado en logs).

grant select, insert, update, delete on invitaciones to service_role;
grant select, insert, update, delete on invitacion_permission_overrides to service_role;

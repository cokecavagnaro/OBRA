-- items_gasto nunca quedó con GRANT para service_role (a diferencia de
-- gastos, ver 010/019) — bloqueaba tanto scripts/qa como cualquier script
-- admin real que necesite insertar ítems (ej. importación masiva de
-- boletas). Mismo criterio que las migraciones 005/010/018/019.
grant select, insert, update, delete on items_gasto to service_role;

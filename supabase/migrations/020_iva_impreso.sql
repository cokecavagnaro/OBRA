-- Auditoría de la decisión bruto/neto: monto de IVA leído tal cual de la
-- boleta (cuando el proveedor lo imprime) y de qué señal salió la
-- interpretación final, para poder depurar sin tener que reabrir la foto.
-- Ambas nullable — boletas anteriores a esta columna y las de modo manual
-- quedan en null sin problema, no se backfillean.
alter table gastos add column if not exists iva_impreso numeric;
alter table gastos add column if not exists fuente_interpretacion text
  check (fuente_interpretacion in ('iva_impreso', 'texto_ia', 'cuadre_total', 'default_bruto'));

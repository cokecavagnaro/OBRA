-- Descuento aplicado al total de la boleta (no a un ítem puntual). Es un
-- dato informativo/snapshot de lo que decía la boleta al escanearla — no se
-- recalcula si después se editan o borran ítems de esa boleta.
alter table gastos add column if not exists descuento_general_monto numeric;
alter table gastos add column if not exists descuento_general_descripcion text;

-- Descuentos IMPRESOS en la boleta (leídos por la IA, aplicados por el
-- servidor con aritmética determinística — nunca calculados por la IA) y
-- otros impuestos distintos del IVA (imp. específico a los combustibles,
-- etc.), necesarios para que el cuadre neto + IVA + otros = total funcione
-- en bencineras. Ver lib/confianzaDocumento.ts (reconciliarBoleta).
alter table gastos add column if not exists otros_impuestos numeric;
alter table items_gasto add column if not exists descuento_monto numeric;
alter table items_gasto add column if not exists descuento_descripcion text;

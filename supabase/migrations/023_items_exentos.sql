-- Ítems exentos de IVA (fletes/despachos que la boleta cobra sin impuesto).
-- Hasta ahora toda la boleta compartía una sola interpretación bruto/neto; un
-- envío exento en una boleta con productos gravados es el primer caso de dos
-- regímenes conviviendo en el mismo documento. Sin esta columna el sistema le
-- descontaría IVA al flete e inflaría el crédito fiscal del proyecto.
alter table items_gasto add column if not exists exento boolean not null default false;

-- Agrega el email de quien creó el gasto (denormalizado al insert, no resuelto
-- por join a `usuarios` en lectura — la RLS de usuarios solo deja a cada quien
-- ver su propia fila salvo admins, así que un join devolvería null para
-- compañeros no-admin) y un comentario libre opcional, ingresado una sola vez
-- al guardar la boleta (paso 3 del escaneo).
alter table gastos add column if not exists creado_por_email text;
alter table gastos add column if not exists comentario text;
